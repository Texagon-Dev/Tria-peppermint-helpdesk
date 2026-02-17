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

/** Maximum number of PDF pages to convert into images */
const MAX_PAGES_TO_CONVERT = 3;

/**
 * Result of converting a single PDF attachment to images.
 */
export interface PdfImageResult {
  /** Original PDF filename */
  filename: string;
  /** Array of Base64-encoded PNG data URIs ("data:image/png;base64,...") */
  images: string[];
}

/**
 * A single Flowise-compatible upload object.
 */
export interface FlowiseUpload {
  /** Base64 data URI */
  data: string;
  /** MIME type */
  mime: string;
  /** Display filename */
  name: string;
  /** Flowise upload type */
  type: "file";
}

/**
 * Convert a PDF buffer into an array of Base64-encoded PNG data-URI strings.
 *
 * Uses `pdf-to-png-converter` which is built on top of Mozilla's PDF.js —
 * **no external binary or OS dependencies** (no Ghostscript, no Puppeteer,
 * no native canvas). Works on Windows, Linux, and macOS without extra setup.
 *
 * @param content - Raw PDF file bytes
 * @param maxPages - Maximum number of pages to render (default: 3)
 * @returns Array of data-URI strings ("data:image/png;base64,...")
 */
export async function convertPdfToImages(
  content: Buffer,
  maxPages: number = MAX_PAGES_TO_CONVERT
): Promise<string[]> {
  try {
    // Dynamic import — pdf-to-png-converter is ESM-only
    const { pdfToPng } = await import("pdf-to-png-converter");

    // Build 1-indexed page numbers: [1, 2, 3, ...]
    const pagesToProcess = Array.from({ length: maxPages }, (_, i) => i + 1);

    logger.info(
      { contentSize: content.length, maxPages },
      "Converting PDF to PNG images"
    );

    // pdfToPng expects string | ArrayBufferLike — convert Node.js Buffer
    // to a proper ArrayBuffer (Buffer.buffer may be a shared allocation,
    // so slice to get an exact-sized copy)
    const arrayBuffer = content.buffer.slice(
      content.byteOffset,
      content.byteOffset + content.byteLength
    );

    const pngPages = await pdfToPng(arrayBuffer, {
      pagesToProcess,
      // Do not write to disk — we only need in-memory buffers
    });

    // Convert each page's PNG buffer to a data URI (skip pages without content)
    const dataUris = pngPages
      .filter((page) => page.content && page.content.length > 0)
      .map((page) => {
        const base64 = page.content!.toString("base64");
        return `data:image/png;base64,${base64}`;
      });

    logger.info(
      { pagesConverted: dataUris.length },
      "PDF to PNG conversion successful"
    );

    return dataUris;
  } catch (err) {
    logger.error({ err }, "Failed to convert PDF to PNG images");
    return []; // Graceful degradation — flow continues without images
  }
}

/**
 * Extract PDF attachments from an email, convert each PDF to PNG images,
 * and return per-document results.
 *
 * @param attachments - Array of parsed email attachments (from mailparser)
 * @returns Array of PdfImageResult (one entry per PDF that produced images)
 */
export async function extractPdfImages(
  attachments: { contentType?: string; filename?: string; content: Buffer }[]
): Promise<PdfImageResult[]> {
  const pdfs = attachments.filter((a) => {
    const type = (a.contentType || "").toLowerCase();
    const name = (a.filename || "").toLowerCase();
    return type.startsWith("application/pdf") || name.endsWith(".pdf");
  });

  if (pdfs.length === 0) return [];

  const results: PdfImageResult[] = [];

  for (const pdf of pdfs) {
    const filename = pdf.filename || "document.pdf";
    const images = await convertPdfToImages(pdf.content);
    if (images.length > 0) {
      results.push({ filename, images });
    }
  }

  return results;
}

/**
 * Transform PdfImageResult[] into the flat Flowise `uploads` array format.
 *
 * Each page becomes a separate upload object:
 * ```json
 * {
 *   "data": "data:image/png;base64,...",
 *   "type": "file",
 *   "name": "invoice.pdf_page1.png",
 *   "mime": "image/png"
 * }
 * ```
 */
export function toFlowiseUploads(
  pdfImageResults: PdfImageResult[]
): FlowiseUpload[] {
  return pdfImageResults.flatMap((doc) =>
    doc.images.map((base64DataUri, index) => ({
      data: base64DataUri,
      type: "file" as const,
      name: `${doc.filename}_page${index + 1}.png`,
      mime: "image/png",
    }))
  );
}
