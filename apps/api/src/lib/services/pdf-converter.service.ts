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
 * Convert a PDF buffer into an array of Base64-encoded PNG data-URI strings.
 *
 * Uses `pdf-to-img` (v5) which is built on top of Mozilla's pdfjs-dist with
 * the `canvas` npm package for high-fidelity server-side rendering.
 * Produces significantly better output for scanned documents, complex fonts,
 * and layered PDFs compared to lighter JS-only renderers.
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
    // Dynamic import — pdf-to-img is ESM-only
    const { pdf } = await import("pdf-to-img");

    logger.info(
      { contentSize: content.length, maxPages },
      "Converting PDF to PNG images via pdf-to-img"
    );

    // pdf-to-img accepts Buffer directly (internally converts to Uint8Array)
    const document = await pdf(content, { scale: 2.0 });

    const dataUris: string[] = [];
    let pageCount = 0;

    for await (const image of document) {
      if (pageCount >= maxPages) break;
      const base64 = image.toString("base64");
      dataUris.push(`data:image/png;base64,${base64}`);
      pageCount++;
    }

    logger.info(
      {
        pagesConverted: dataUris.length,
        totalPages: document.length,
        firstPageLength: dataUris[0]?.length || 0,
        firstPagePrefix: dataUris[0]?.substring(0, 50),
      },
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
  const pdfAttachments = attachments.filter((a) => {
    const type = (a.contentType || "").toLowerCase();
    const name = (a.filename || "").toLowerCase();
    return type.startsWith("application/pdf") || name.endsWith(".pdf");
  });

  if (pdfAttachments.length === 0) return [];

  const results: PdfImageResult[] = [];

  for (const attachment of pdfAttachments) {
    const filename = attachment.filename || "document.pdf";
    const images = await convertPdfToImages(attachment.content);
    if (images.length > 0) {
      results.push({ filename, images });
    }
  }

  return results;
}
