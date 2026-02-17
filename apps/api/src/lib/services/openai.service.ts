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
    type: "INVOICE" | "QUOTE" | "OTHER";
    confidence: number;
    key_signal: string;
}

export interface VisionExtractionResult {
    classification: DocumentClassification;
    extracted_text: string;
}

const CLASSIFY_AND_EXTRACT_SYSTEM_PROMPT = `
You are a German document analyzer for a property management company (Hausverwaltung).

## TASK 1: CLASSIFY the document
Look for these keywords:

INVOICE (Rechnung):
- "Rechnung", "Rechnungsnummer", "Rechnungsdatum"
- "Endsumme", "Zahlbar bis", "Zahlungsziel"
- "Nettobetrag", "Bruttobetrag", "MwSt"
- "Beitragsrechnung" (insurance premium invoice)
- "Jahresrechnung", "Abrechnung"

QUOTE (Angebot/Kostenvoranschlag):
- "Angebot", "Kostenvoranschlag"
- "unverbindlich", "Gültig bis"

OTHER: Work orders, delivery notes, correspondence.

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
- The documents are scanned images of German business documents.
- Extract text EXACTLY as written (preserve German characters, numbers, dates).
- For multi-page documents, separate pages with "--- Page N ---" markers.
- Amount formats: keep original German format (1.234,56) in the text.
`;

export class OpenAIService {
    /**
     * Single combined call: classify + extract text from PDF page images.
     * Uses ONE OpenAI Vision API call to do both tasks (cost-efficient).
     *
     * @param base64Images - Array of data URIs ("data:image/png;base64,...")
     * @returns Classification + full extracted text
     */
    static async classifyAndExtract(
        base64Images: string[]
    ): Promise<VisionExtractionResult> {
        if (base64Images.length === 0) {
            return {
                classification: { type: "OTHER", confidence: 0, key_signal: "no images" },
                extracted_text: "",
            };
        }

        const imageMessages = base64Images.map((dataUri) => ({
            type: "image_url" as const,
            image_url: { url: dataUri, detail: "high" as const },
        }));

        try {
            const response = await openai.chat.completions.create({
                model: VISION_MODEL,
                max_tokens: 4096,
                temperature: 0.1,
                messages: [
                    {
                        role: "system",
                        content: CLASSIFY_AND_EXTRACT_SYSTEM_PROMPT,
                    },
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: "Analyze the following document page images. Classify the document and extract ALL visible text.",
                            },
                            ...imageMessages,
                        ],
                    },
                ],
                response_format: { type: "json_object" },
            });

            const raw = response.choices[0]?.message?.content || "{}";
            const parsed = JSON.parse(raw);

            return {
                classification: {
                    type: (parsed.document_type?.toUpperCase() as any) || "OTHER",
                    confidence: parsed.confidence || 0,
                    key_signal: parsed.key_signal || "",
                },
                extracted_text: parsed.extracted_text || "",
            };
        } catch (error) {
            logger.error({ err: error }, "OpenAI Vision classification failed");
            throw error;
        }
    }
}
