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
const VISION_MODEL = process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";

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
You are a document analyzer for a property management company.

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
Transcribe every piece of visible text from the document images, preserving:
- Headers, addresses, dates, reference numbers
- All line items (descriptions, quantities, prices)
- Totals, tax amounts, payment terms
- Any handwritten notes or stamps
- Preserve the document structure (use newlines, indentation)

## OUTPUT FORMAT (JSON)
{
  "document_type": "invoice" | "quote" | "other",
  "confidence": 0.0-1.0,
  "key_signal": "Brief explanation of why this classification",
  "extracted_text": "Full transcribed text from all pages, preserving structure"
}

IMPORTANT:
- The documents are scanned images of business documents (German or English).
- Extract text EXACTLY as written.
- For multi-page documents, separate pages with "--- Page N ---" markers.
- Amount formats: keep original format (1.234,56 or 1,234.56).
`;

export interface PdfAttachment {
    content: Buffer;
    filename: string;
}

export class OpenAIService {
    /**
     * Single combined call: classify + extract text from PDF attachments.
     *
     * Sends raw PDF files directly to OpenAI via the Responses API `input_file`
     * content type. OpenAI internally extracts both text and page images from
     * each PDF, giving the model full context without requiring server-side
     * PDF-to-image conversion (eliminates the canvas/native-lib dependency).
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
            "Sending PDF files directly to OpenAI Responses API"
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
                                text: "Analyze the following PDF document(s). Classify the document and extract ALL visible text. Respond in JSON format.",
                            },
                            ...fileInputs,
                        ],
                    },
                ],
                text: { format: { type: "json_object" } },
                temperature: 0.1,
                max_output_tokens: 4096,
                store: false,
            });

            const raw = response.output_text || "{}";
            logger.info({ rawResponse: raw }, "OpenAI Vision raw response");
            const parsed = JSON.parse(raw);

            return {
                classification: {
                    type: (parsed.document_type?.toUpperCase() as any) || "OTHER",
                    confidence: parsed.confidence || 0,
                    key_signal: parsed.key_signal || "",
                },
                extracted_text: parsed.extracted_text || "",
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
}
