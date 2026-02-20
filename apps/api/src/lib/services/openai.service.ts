import OpenAI from "openai";
import pino from "pino";

const logger = pino({
    serializers: {
        err: (err) => {
            if (err instanceof Error) {
                return {
                    type: err.name,
                    message: err.message,
                    stack: err.stack,
                };
            }
            return String(err);
        },
    },
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
// Responses API: https://platform.openai.com/docs/api-reference/responses
// GPT-5.2: vision (image input), Structured Outputs, v1/responses
const VISION_MODEL = process.env.OPENAI_VISION_MODEL || "gpt-5.2";
const MAX_ATTACHMENTS = 3;
const MAX_TOTAL_BYTES = 10 * 1024 * 1024; // 10MB

export interface DocumentClassification {
    type: "INVOICE" | "QUOTE" | "OTHER" | "ERROR";
    confidence: number;
    key_signal: string;
}

export interface VisionExtractionResult {
    classification: DocumentClassification;
    extracted_text: string;
}

const CLASSIFY_AND_EXTRACT_SYSTEM_PROMPT = `
You are a high-precision OCR and document analyzer for a German property management company.

## CRITICAL: ACCURACY RULES
- You are an OCR engine. Transcribe ONLY what you can actually read in the document.
- NEVER fabricate, guess, or hallucinate text that is not visible in the document.
- If a word or number is unclear, write "[unclear]" instead of guessing.
- Read every character carefully: names, addresses, numbers, and amounts must be EXACT.
- Pay special attention to structured fields in boxes/tables (e.g. Kundennummer, Rechnungsnummer).
- German invoices often have reference number boxes — read ALL fields inside them.

## TASK 1: CLASSIFY the document
Look for these keywords (German OR English):

INVOICE (Rechnung / Invoice):
- "Rechnung", "Invoice", "Bill", "Tax Invoice"
- "Rechnungsnummer", "Invoice Number", "Rechnungsdatum", "Invoice Date"
- "Endsumme", "Total", "Amount Due", "Payable by", "Zahlbar bis"
- "Nettobetrag", "Bruttobetrag", "MwSt", "VAT", "Tax"
- "Beitragsrechnung", "Jahresrechnung", "Abrechnung"

QUOTE (Angebot / Quote):
- "Angebot", "Kostenvoranschlag", "Quote", "Estimate", "Proposal"
- "unverbindlich", "Gültig bis", "Valid until", "Expiration date"

OTHER: Work orders, delivery notes, correspondence, generic emails.

## TASK 2: EXTRACT all visible text
Transcribe every piece of visible text from the document, preserving structure:
- Company headers and logos (company name)
- Sender address block (who sent the invoice)
- Recipient address block (Herrn/Frau, name, street, city)
- ALL reference number fields: Kundennummer, Rechnungsnummer, Vertragsnummer, Referenz, Auftragsnummer
- Date fields: Rechnungsdatum, invoice date
- Line item table: read EVERY column — Bezeichnung/description, Menge/quantity, Einzelpreis/unit price, Nettobetrag/total
- Summary: Nettobetrag/Zwischensumme, Mehrwertsteuer/MwSt (rate + amount), Gesamtbetrag/Brutto
- Payment terms: due date, bank details (IBAN, BIC, Bank name)
- Tax info: Steuernummer, USt-IdNr
- Footer text, stamps, handwritten notes
- Use newlines to separate sections; use single spaces (not tabs) for alignment

IMPORTANT:
- The documents are scanned images of German business documents.
- Transcribe EXACTLY what is printed — do NOT paraphrase or summarize.
- Read numbers digit by digit: 530025335 is NOT 518,24.
- Read names letter by letter: "Pleister" is NOT "Pfister".
- For multi-page documents, separate pages with "--- Page N ---" markers.
- Amount formats: keep original German format (1.234,56).
- Do NOT pad with tabs, trailing spaces, or repeated whitespace. Keep output compact.
`;

// Quote extraction only: prompt asks for OCR text, no classification
const QUOTE_EXTRACT_SYSTEM_PROMPT = `
You are a high-precision OCR engine for business documents (e.g. quotes, estimates, proposals).

## RULES
- Transcribe ONLY what you can actually read in the document. Do NOT fabricate or guess.
- If something is unclear, write "[unclear]".
- Preserve structure: use newlines between sections; use single spaces for alignment.
- For multi-page documents, separate pages with "--- Page N ---" markers.
- Amount formats: keep original format (e.g. German 1.234,56).
- Output ONLY the extracted text for each document — no classification, no commentary.
`;

// Schema for quote extraction: one text per document, same order as input files
const QUOTE_EXTRACT_SCHEMA = {
    type: "object" as const,
    properties: {
        documents: {
            type: "array" as const,
            items: {
                type: "object" as const,
                properties: {
                    filename: { type: "string" as const, description: "Original PDF filename" },
                    extracted_text: { type: "string" as const, description: "Full transcribed text from this document" },
                },
                required: ["filename", "extracted_text"] as const,
                additionalProperties: false as const,
            },
        },
    },
    required: ["documents"] as const,
    additionalProperties: false as const,
};

// Structured Output schema (strict mode) — guarantees valid JSON matching this shape
const EXTRACTION_SCHEMA = {
    type: "object" as const,
    properties: {
        document_type: {
            type: "string" as const,
            enum: ["invoice", "quote", "other"],
            description: "Classification of the document",
        },
        confidence: {
            type: "number" as const,
            description: "Classification confidence from 0.0 to 1.0",
        },
        key_signal: {
            type: "string" as const,
            description: "Brief explanation of why this classification was chosen",
        },
        extracted_text: {
            type: "string" as const,
            description: "Full transcribed text from all pages, preserving structure with newlines",
        },
    },
    required: ["document_type", "confidence", "key_signal", "extracted_text"] as const,
    additionalProperties: false as const,
};

export interface PdfAttachment {
    content: Buffer;
    filename: string;
}

export class OpenAIService {
    /**
     * Single combined call: classify + extract text from PDF attachments.
     *
     * Sends raw PDF files directly to OpenAI via the Responses API `input_file`
     * content type. Uses Structured Outputs (json_schema + strict) so the API
     * guarantees a valid JSON response matching our schema — no manual JSON
     * recovery needed.
     *
     * @param pdfAttachments - Array of raw PDF buffers with filenames
     * @returns Classification + full extracted text
     */
    static async classifyAndExtract(
        pdfAttachments: PdfAttachment[]
    ): Promise<VisionExtractionResult> {
        if (pdfAttachments.length === 0) {
            return {
                classification: { type: "OTHER", confidence: 0, key_signal: "no attachments" },
                extracted_text: "",
            };
        }

        if (pdfAttachments.length > MAX_ATTACHMENTS) {
            logger.warn(
                { count: pdfAttachments.length, max: MAX_ATTACHMENTS },
                "OpenAI service rejected request: too many attachments"
            );
            return {
                classification: {
                    type: "ERROR",
                    confidence: 0,
                    key_signal: `Too many attachments (max ${MAX_ATTACHMENTS})`,
                },
                extracted_text: "",
            };
        }

        const totalBytes = pdfAttachments.reduce((sum, a) => sum + a.content.length, 0);
        if (totalBytes > MAX_TOTAL_BYTES) {
            logger.warn(
                { totalBytes, max: MAX_TOTAL_BYTES },
                "OpenAI service rejected request: attachments too large"
            );
            return {
                classification: {
                    type: "ERROR",
                    confidence: 0,
                    key_signal: `Total attachment size exceeds limit (${(MAX_TOTAL_BYTES / 1024 / 1024).toFixed(0)}MB)`,
                },
                extracted_text: "",
            };
        }

        const fileInputs = pdfAttachments.map((att) => ({
            type: "input_file" as const,
            filename: att.filename,
            file_data: `data:application/pdf;base64,${att.content.toString("base64")}`,
        }));

        logger.info(
            {
                fileCount: pdfAttachments.length,
                filenames: pdfAttachments.map((a) => a.filename),
                totalBytes: pdfAttachments.reduce((sum, a) => sum + a.content.length, 0),
            },
            "Sending PDF files directly to OpenAI Responses API (Structured Outputs)"
        );

        try {
            const response = await openai.responses.create({
                model: VISION_MODEL,
                instructions: CLASSIFY_AND_EXTRACT_SYSTEM_PROMPT,
                input: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "input_text" as const,
                                text: "Analyze the following PDF document(s). Classify the document and extract ALL visible text.",
                            },
                            ...fileInputs,
                        ],
                    },
                ],
                text: {
                    format: {
                        type: "json_schema",
                        name: "document_extraction",
                        strict: true,
                        schema: EXTRACTION_SCHEMA,
                    },
                },
                temperature: 0.1,
                max_output_tokens: 16384,
                store: false,
            });

            if (response.error) {
                const errMsg = response.error.message || "Unknown API error";
                logger.error({ error: response.error }, "OpenAI Responses API returned error object");
                throw new Error(errMsg);
            }

            const raw = response.output_text ?? "{}";
            logger.info(
                { rawResponseLength: raw.length, rawResponsePreview: raw.substring(0, 500) },
                "OpenAI Structured Output response"
            );

            let parsed;
            try {
                parsed = JSON.parse(raw);
            } catch (error: any) {
                logger.error({ error, rawResponse: raw }, "OpenAI Vision classification: Failed to parse JSON response");
                return {
                    classification: {
                        type: "ERROR",
                        confidence: 0,
                        key_signal: `JSON Parse Error: ${error.message}`,
                    },
                    extracted_text: "",
                };
            }

            return {
                classification: {
                    type: (parsed.document_type?.toUpperCase() as DocumentClassification["type"]) || "OTHER",
                    confidence: parsed.confidence ?? 0,
                    key_signal: parsed.key_signal ?? "",
                },
                extracted_text: parsed.extracted_text ?? "",
            };
        } catch (error: any) {
            logger.error({ err: error }, "OpenAI Vision classification failed - falling back to OTHER");

            return {
                classification: {
                    type: "ERROR",
                    confidence: 0,
                    key_signal: `Error: ${error.message || "Unknown error"}`,
                },
                extracted_text: "",
            };
        }
    }

    /**
     * Extract text from PDF attachments only (no classification).
     * Used for quote path so scanned/image PDFs get text. Returns a string in the
     * same format as extractPdfText: "\n\n--- PDF: filename ---\n{text}" per file.
     * On failure or empty, returns "" so caller can fall back to pdf-parse.
     */
    static async extractTextFromPdfs(pdfAttachments: PdfAttachment[]): Promise<string> {
        if (pdfAttachments.length === 0) return "";

        if (pdfAttachments.length > MAX_ATTACHMENTS) {
            logger.warn(
                { count: pdfAttachments.length, max: MAX_ATTACHMENTS },
                "OpenAI quote extraction: too many attachments"
            );
            return "";
        }

        const totalBytes = pdfAttachments.reduce((sum, a) => sum + a.content.length, 0);
        if (totalBytes > MAX_TOTAL_BYTES) {
            logger.warn(
                { totalBytes, max: MAX_TOTAL_BYTES },
                "OpenAI quote extraction: attachments too large"
            );
            return "";
        }

        const fileInputs = pdfAttachments.map((att) => ({
            type: "input_file" as const,
            filename: att.filename,
            file_data: `data:application/pdf;base64,${att.content.toString("base64")}`,
        }));

        logger.info(
            { fileCount: pdfAttachments.length, filenames: pdfAttachments.map((a) => a.filename) },
            "OpenAI quote extraction: sending PDFs for text extraction"
        );

        try {
            const response = await openai.responses.create({
                model: VISION_MODEL,
                instructions: QUOTE_EXTRACT_SYSTEM_PROMPT,
                input: [
                    {
                        role: "user",
                        content: [
                            { type: "input_text" as const, text: "Extract ALL visible text from each PDF. Return one extracted_text per document in the same order as the files." },
                            ...fileInputs,
                        ],
                    },
                ],
                text: {
                    format: {
                        type: "json_schema",
                        name: "quote_extraction",
                        strict: true,
                        schema: QUOTE_EXTRACT_SCHEMA,
                    },
                },
                temperature: 0.1,
                max_output_tokens: 16384,
                store: false,
            });

            if (response.error) {
                logger.error({ error: response.error }, "OpenAI quote extraction: API error");
                return "";
            }

            const raw = response.output_text ?? "{}";
            let parsed;
            try {
                parsed = JSON.parse(raw);
            } catch (error: any) {
                logger.error({ error, rawResponse: raw }, "OpenAI quote extraction: Failed to parse JSON response");
                return "";
            }
            const documents = parsed.documents ?? [];

            if (!Array.isArray(documents) || documents.length === 0) return "";

            // Format like extractPdfText: "\n\n--- PDF: filename ---\n{text}" per file
            const parts: string[] = [];
            for (let i = 0; i < documents.length; i++) {
                const doc = documents[i];
                const filename = typeof doc.filename === "string" ? doc.filename : pdfAttachments[i]?.filename ?? "document.pdf";
                const text = typeof doc.extracted_text === "string" ? doc.extracted_text.trim() : "";
                if (text) {
                    parts.push(`\n\n--- PDF: ${filename} ---\n${text}`);
                } else {
                    parts.push(`\n\n--- PDF: ${filename} (no extractable text) ---`);
                }
            }
            return parts.join("");
        } catch (error: any) {
            logger.error({ err: error }, "OpenAI quote extraction failed");
            return "";
        }
    }
}
