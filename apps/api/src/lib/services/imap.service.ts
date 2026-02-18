import EmailReplyParser from "email-reply-parser";
import Imap from "imap";
import { simpleParser, ParsedMail, Headers, Attachment } from "mailparser";
import pdf from "pdf-parse";
import { prisma } from "../../prisma";
import { EmailConfig, EmailQueue } from "../types/email";
import { AuthService } from "./auth.service";
import { sendWebhookNotification } from "../notifications/webhook";
import { TicketPriority } from "../types/ticket";
import pino from "pino";
import { Ticket, TicketStatus, Webhooks } from "@prisma/client";
import { OpenAIService, DocumentClassification, PdfAttachment } from "./openai.service";

// Custom serializer to handle BigInt values in pino
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

/** Maximum PDF file size to attempt text extraction (10 MB) */
const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024;

/** Maximum number of pages to parse from a single PDF */
const MAX_PDF_PAGE_LIMIT = 10;

/** Maximum character length of extracted text per PDF to prevent oversized payloads */
const MAX_EXTRACTED_TEXT_PER_PDF = 50_000;

/**
 * Maintenance statuses where a vendor PDF attachment is expected to be an invoice
 * (work has been authorized and is in progress or completed).
 * All other statuses (pending, quote_sent_to_vendor, vendor_quote_received,
 * awaiting_customer_approval) indicate the PDF is likely a quote.
 */
const INVOICE_EXPECTED_STATUSES = [
  'customer_approved',
  'vendor_contacting_tenant',
  'appointment_request_sent',
  'vendor_confirmed_appointment',
  'customer_notified_of_appointment',
  'work_completed',
];

/**
 * Safely convert a header value to string, handling BigInt and other types
 */
function safeHeaderValue(value: any): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(v => safeHeaderValue(v)).join(' ');
  return String(value);
}

/**
 * Normalize a Message-ID by removing angle brackets and trimming whitespace
 */
function normalizeMessageId(messageId: string | undefined | null): string | null {
  if (!messageId) return null;
  return messageId.trim().replace(/^<|>$/g, "");
}

/**
 * Extract the reply text from an email, stripping quoted content
 */
function getReplyText(email: any): string {
  const parsed = new EmailReplyParser().read(email.text);
  const fragments = parsed.getFragments();

  let replyText = "";

  fragments.forEach((fragment: any) => {
    if (!fragment._isHidden && !fragment._isSignature && !fragment._isQuoted) {
      replyText += fragment._content;
    }
  });

  return replyText;
}

/**
 * Escape HTML special characters to safely embed text in HTML context
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Extract text content from PDF attachments in an email.
 * Processes each PDF sequentially to limit memory usage.
 * Returns the concatenated text from all PDFs, or empty string if none found.
 */
export async function extractPdfText(attachments: Attachment[]): Promise<string> {
  const pdfAttachments = attachments.filter((att) => {
    const type = (att.contentType || "").toLowerCase();
    const name = (att.filename || "").toLowerCase();
    return type.startsWith("application/pdf") || name.endsWith(".pdf");
  });

  if (pdfAttachments.length === 0) {
    return "";
  }

  const extractedParts: string[] = [];

  for (const att of pdfAttachments) {
    const rawFilename = att.filename || "unnamed.pdf";
    const filename = rawFilename.replace(/[\r\n\t]/g, " ").slice(0, 200);
    const sizeBytes = att.content.length;

    if (sizeBytes > MAX_PDF_SIZE_BYTES) {
      logger.warn(
        { filename, sizeBytes, maxBytes: MAX_PDF_SIZE_BYTES },
        "Skipping PDF extraction: file exceeds size limit"
      );
      extractedParts.push(
        `\n\n--- PDF: ${filename} (skipped: ${(sizeBytes / 1024 / 1024).toFixed(1)} MB exceeds limit) ---`
      );
      continue;
    }

    try {
      logger.info({ filename, sizeBytes }, "Extracting text from PDF attachment");
      const result = await pdf(att.content, { max: MAX_PDF_PAGE_LIMIT });
      let text = result.text?.trim();

      if (text) {
        // Cap extracted text length to prevent oversized payloads
        const wasTruncated = text.length > MAX_EXTRACTED_TEXT_PER_PDF;
        if (wasTruncated) {
          text = text.slice(0, MAX_EXTRACTED_TEXT_PER_PDF);
        }

        let pdfHeader = `--- PDF: ${filename}`;
        if (result.numpages > MAX_PDF_PAGE_LIMIT) {
          pdfHeader += ` (first ${MAX_PDF_PAGE_LIMIT} of ${result.numpages} pages)`;
        }
        if (wasTruncated) {
          pdfHeader += ` (text truncated)`;
        }
        pdfHeader += " ---";

        extractedParts.push(`\n\n${pdfHeader}\n${text}`);
        logger.info(
          {
            filename,
            extractedLength: text.length,
            totalPages: result.numpages,
            parsedPages: Math.min(result.numpages, MAX_PDF_PAGE_LIMIT),
            truncated: wasTruncated,
          },
          "PDF text extraction successful"
        );
      } else {
        extractedParts.push(
          `\n\n--- PDF: ${filename} (no extractable text) ---`
        );
        logger.info(
          { filename },
          "PDF contained no extractable text (possibly scanned/image-only)"
        );
      }
    } catch (err) {
      logger.error(
        {
          filename,
          errorName: err instanceof Error ? err.name : typeof err,
          errorMessage: err instanceof Error ? err.message : String(err),
        },
        "PDF text extraction failed - continuing with remaining attachments"
      );
      extractedParts.push(`\n\n--- PDF: ${filename} (extraction failed) ---`);
    }
  }

  return extractedParts.join("");
}

export class ImapService {
  /**
   * Helper to extract PDF attachments from parsed email
   */
  private static _extractPdfAttachments(parsed: ParsedMail): PdfAttachment[] {
    return (parsed.attachments || [])
      .filter((a) => {
        const type = (a.contentType || "").toLowerCase();
        const name = (a.filename || "").toLowerCase();
        return type.startsWith("application/pdf") || name.endsWith(".pdf");
      })
      .map((a) => ({ content: a.content, filename: a.filename || "document.pdf" }));
  }

  /**
   * Get IMAP configuration based on service type (Gmail OAuth or standard IMAP)
   */
  private static async getImapConfig(queue: EmailQueue): Promise<EmailConfig> {
    switch (queue.serviceType) {
      case "gmail": {
        const validatedAccessToken = await AuthService.getValidAccessToken(
          queue
        );

        return {
          user: queue.username,
          host: queue.hostname,
          port: 993,
          tls: true,
          xoauth2: AuthService.generateXOAuth2Token(
            queue.username,
            validatedAccessToken
          ),
          tlsOptions: { rejectUnauthorized: false, servername: queue.hostname },
          connTimeout: 60000, // 60 seconds connection timeout
          authTimeout: 30000, // 30 seconds auth timeout
        };
      }
      case "other":
        return {
          user: queue.username,
          password: queue.password,
          host: queue.hostname,
          port: queue.tls ? 993 : 143,
          tls: queue.tls || false,
          tlsOptions: { rejectUnauthorized: false, servername: queue.hostname },
          connTimeout: 60000, // 60 seconds connection timeout
          authTimeout: 30000, // 30 seconds auth timeout
        };
      default:
        throw new Error("Unsupported service type");
    }
  }

  /**
   * Check if the email is an auto-reply that should be ignored
   * Prevents bot-on-bot email storms
   */
  private static isAutoReply(headers: Headers): boolean {
    const autoSubmitted = safeHeaderValue(headers.get("auto-submitted"));
    const xAutoResponse = safeHeaderValue(headers.get("x-auto-response-suppress"));
    const xPeppermintAI = safeHeaderValue(headers.get("x-peppermint-ai"));
    const precedence = safeHeaderValue(headers.get("precedence"));
    const xAutoReply = safeHeaderValue(headers.get("x-autoreply"));
    const xMsExchangeAuto = safeHeaderValue(headers.get("x-ms-exchange-auto-submissions"));

    return (
      (autoSubmitted !== null && autoSubmitted !== "no") ||
      !!xAutoResponse ||
      xPeppermintAI === "true" ||
      ["bulk", "list", "auto_reply"].includes(precedence || "") ||
      xAutoReply === "yes" ||
      !!xMsExchangeAuto
    );
  }

  /**
   * LAYER 1: Match using Gmail's X-GM-THRID header
   * This is 100% accurate for Gmail conversations
   */
  private static async matchByGmailThreadId(
    headers: Headers
  ): Promise<Ticket | null> {
    // Use safeHeaderValue to handle BigInt values from Gmail
    const gmailThreadId = safeHeaderValue(headers.get("x-gm-thrid"));
    if (!gmailThreadId) return null;

    logger.debug({ gmailThreadId }, "Layer 1: Checking Gmail Thread ID");

    const ticket = await prisma.ticket.findFirst({
      where: { threadId: gmailThreadId },
    });

    if (ticket) {
      logger.info({ ticketId: ticket.id }, "Layer 1: Matched by Gmail Thread ID");
    }
    return ticket;
  }

  /**
   * LAYER 2: Match using RFC 5322 References and In-Reply-To headers
   * Works across all email providers
   */
  private static async matchByMessageIdChain(
    headers: Headers
  ): Promise<Ticket | null> {
    const referencesRaw = safeHeaderValue(headers.get("references"));
    const inReplyToRaw = safeHeaderValue(headers.get("in-reply-to"));

    // Parse References header (space-separated list of Message-IDs)
    let references: string[] = [];
    if (referencesRaw) {
      references = referencesRaw.split(/\s+/).filter(Boolean);
    }

    // Add In-Reply-To if present
    const inReplyTo = inReplyToRaw || undefined;

    // Normalize all message IDs
    const messageIds = [...references, inReplyTo]
      .map(normalizeMessageId)
      .filter((id): id is string => id !== null);

    if (messageIds.length === 0) return null;

    logger.debug({ messageIds }, "Layer 2: Checking RFC 5322 Message-ID chain");

    // First, check if any messageId matches a Comment's messageId
    const comment = await prisma.comment.findFirst({
      where: { messageId: { in: messageIds } },
      include: { ticket: true },
    });

    if (comment?.ticket) {
      logger.info(
        { ticketId: comment.ticket.id },
        "Layer 2: Matched by Comment Message-ID"
      );
      return comment.ticket;
    }

    // Then, check if any messageId is in a Ticket's externalIds array
    const ticket = await prisma.ticket.findFirst({
      where: { externalIds: { hasSome: messageIds } },
    });

    if (ticket) {
      logger.info(
        { ticketId: ticket.id },
        "Layer 2: Matched by Ticket externalIds"
      );
    }
    return ticket;
  }

  /**
   * LAYER 3: Heuristic matching based on subject line and sender email
   * Fallback when email headers are missing or malformed
   * Only matches OPEN tickets to avoid false positives
   */
  private static async matchByHeuristics(
    from: string,
    subject: string
  ): Promise<Ticket | null> {
    // Normalize subject by removing Re:/Fwd: prefixes
    const normalizedSubject = subject
      .replace(/^(re:|fwd:|fw:|ref:)\s*/gi, "")
      .trim();

    if (!normalizedSubject) return null;

    logger.debug(
      { from, normalizedSubject },
      "Layer 3: Checking heuristic match"
    );

    // Only match against OPEN tickets (not closed/done)
    const openStatuses: TicketStatus[] = ["needs_support", "in_progress", "hold", "in_review"];

    // Use full-text search for better performance on large tables
    // Prisma fullTextSearch is enabled in schema.prisma previewFeatures
    try {
      const ticket = await prisma.ticket.findFirst({
        where: {
          email: from,
          title: { search: normalizedSubject.split(/\s+/).join(' & ') },
          status: { in: openStatuses },
          isComplete: false,
          locked: false,
        },
        orderBy: { createdAt: "desc" },
      });

      if (ticket) {
        logger.info(
          { ticketId: ticket.id },
          "Layer 3: Matched by subject + sender heuristics (full-text)"
        );
        return ticket;
      }
    } catch (searchError) {
      // Full-text search may fail on some databases, fall back to contains
      logger.debug({ searchError }, "Full-text search failed, using contains fallback");
    }

    // Fallback to contains filter if full-text search fails or returns no results
    const ticket = await prisma.ticket.findFirst({
      where: {
        email: from,
        title: { contains: normalizedSubject, mode: "insensitive" },
        status: { in: openStatuses },
        isComplete: false,
        locked: false,
      },
      orderBy: { createdAt: "desc" },
    });

    if (ticket) {
      logger.info(
        { ticketId: ticket.id },
        "Layer 3: Matched by subject + sender heuristics (contains)"
      );
    }
    return ticket;
  }

  /**
   * Check if sender email is a registered vendor
   */
  private static async findVendorByEmail(email: string) {
    return prisma.vendor.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        active: true
      },
      select: {
        id: true,
        name: true,
        email: true
      }
    });
  }

  /**
   * Check if sender email is a registered utility company
   */
  private static async findUtilityCompanyByEmail(email: string) {
    return prisma.utilityCompany.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        active: true
      },
      select: {
        id: true,
        name: true,
        email: true
      }
    });
  }

  /**
   * Check if an attachment is a PDF (by content-type or filename extension)
   */
  private static isPdfAttachment(a: Attachment): boolean {
    return (
      a.contentType === 'application/pdf' ||
      (!!a.filename && a.filename.toLowerCase().endsWith('.pdf'))
    );
  }

  /**
   * Check if email has PDF attachments
   */
  private static hasPdfAttachment(attachments: Attachment[]): boolean {
    return attachments.some(ImapService.isPdfAttachment);
  }

  /**
   * Extract PDF attachment metadata for webhook payload
   */
  private static extractPdfAttachmentData(attachments: Attachment[]) {
    return attachments
      .filter(ImapService.isPdfAttachment)
      .map((a) => ({
        filename: a.filename || 'document.pdf',
        content: a.content.toString('base64'),
        contentType: 'application/pdf',
      }));
  }

  /**
   * Update externalIds within a Prisma transaction. Returns the final externalIds array.
   * Centralizes the dedup-and-append logic used by all vendor/utility reply paths.
   */
  private static async updateExternalIdsInTx(
    tx: { ticket: { findUnique: Function; update: Function } },
    ticketId: string,
    messageId: string | null
  ): Promise<string[]> {
    const current = await tx.ticket.findUnique({
      where: { id: ticketId },
      select: { externalIds: true },
    });
    const currentIds: string[] = current?.externalIds ?? [];

    if (!messageId || currentIds.includes(messageId)) {
      return currentIds;
    }

    const updatedIds = [...currentIds, messageId];
    await tx.ticket.update({
      where: { id: ticketId },
      data: { externalIds: updatedIds },
    });
    return updatedIds;
  }

  /**
   * Fire dedicated invoice_received webhook for Path B (standalone invoices).
   * Queries all active webhooks of type 'invoice_received' and sends the payload.
   * Sends PDF pages as PNG images in Flowise `uploads` format.
   */
  private static async fireInvoiceWebhook(
    senderEmail: string,
    emailSubject: string,
    baseText: string,
    baseHtml: string,
    emailDate: Date | undefined,
    senderEntity: { id: string; name: string; email: string },
    senderType: 'vendor' | 'utility',
    classification: DocumentClassification,
    extractedText: string
  ) {
    const webhooks = await prisma.webhooks.findMany({
      where: { type: 'invoice_received', active: true },
    });

    await Promise.all(
      webhooks.map(async (webhook) => {
        const message = {
          event: 'invoice_received',
          sender: {
            type: senderType,
            id: senderEntity.id,
            name: senderEntity.name,
          },
          // uploads: uploads, // REMOVED
          // NEW:
          document_classification: classification.type,
          document_confidence: classification.confidence,
          classification_signal: classification.key_signal,
          extracted_text: extractedText,
          ticketId: null, // No ticket — standalone
          emailBody: baseText,
          emailSubject: emailSubject,
          emailFrom: senderEmail,
          emailDate: emailDate?.toISOString() || null,
        };
        logger.info(
          { url: webhook.url, senderType, senderName: senderEntity.name, documentType: classification.type },
          'Triggering invoice_received webhook (Path B — standalone)'
        );
        await sendWebhookNotification(webhook, message);
      })
    );
  }

  /**
   * Extract [REQ-xxx] reference from subject line
   * Format: [REQ-abc12345] where abc12345 is first 8 chars of ticket ID (hex)
   */
  private static extractRequestReference(subject: string): string | null {
    // Require exactly 8 hex characters to avoid false matches
    const match = subject.match(/\[REQ-([a-f0-9]{8})\]/i);
    return match?.[1] ?? null;
  }

  /**
   * Find ticket by REQ reference (first 8+ chars of ticket ID)
   */
  private static async findTicketByReference(ref: string): Promise<Ticket | null> {
    return prisma.ticket.findFirst({
      where: {
        id: { startsWith: ref, mode: 'insensitive' },
        isComplete: false,
      },
    });
  }

  /**
   * Add message ID to ticket's externalIds array (deduped)
   */
  private static async addMessageIdToTicket(
    ticketId: string,
    currentExternalIds: string[],
    messageId: string | null
  ): Promise<void> {
    if (!messageId) return;
    const updatedExternalIds = [...new Set([...currentExternalIds, messageId])];
    await prisma.ticket.update({
      where: { id: ticketId },
      data: { externalIds: updatedExternalIds },
    });
  }

  /**
   * Triple-Layer Matching Engine

   * Attempts to find an existing ticket for the incoming email
   */
  private static async findMatchingTicket(
    headers: Headers,
    from: string,
    subject: string
  ): Promise<Ticket | null> {
    // Layer 1: Gmail Thread ID (100% accurate for Gmail)
    let ticket = await this.matchByGmailThreadId(headers);
    if (ticket) return ticket;

    // Layer 2: RFC 5322 References/In-Reply-To (High accuracy)
    ticket = await this.matchByMessageIdChain(headers);
    if (ticket) return ticket;

    // Layer 3 DISABLED: Subject-based matching is unreliable and can incorrectly merge
    // unrelated tickets that happen to have similar subject lines (e.g., two different
    // "Broken Lock" issues from the same sender). If an email lacks proper threading
    // headers (Layer 1/2), it's safer to create a new ticket.
    // ticket = await this.matchByHeuristics(from, subject);

    return ticket;
  }

  /**
   * Process an incoming email - either append to existing ticket or create new.
   *
   * UC3 Phase 3 "Switchboard" routing:
   *  - Vendor/Utility + PDF + in-thread + invoice-expected status → PATH A (enriched webhook)
   *  - Vendor/Utility + PDF + no ticket → PATH B (audit log + direct invoice_received webhook, NO ticket)
   *  - Vendor/Utility + PDF + in-thread + quote status → Normal MOH flow (existing behavior)
   *  - Vendor/Utility without PDF → Normal vendor reply (existing behavior)
   *  - Customer → Normal ticket flow (existing behavior)
   */
  private static async processEmail(parsed: ParsedMail): Promise<void> {
    const { from, subject, text, html, textAsHtml, headers, messageId } = parsed;

    // Validate sender address
    if (!from?.value?.[0]?.address) {
      logger.warn({ subject }, "Skipping email with invalid sender");
      return;
    }

    const senderEmail = from.value[0].address;
    const senderName = from.value[0].name || "";
    const emailSubject = subject || "No Subject";
    const normalizedMessageId = normalizeMessageId(messageId);

    // Extract text from PDF attachments
    const pdfText = await extractPdfText(parsed.attachments || []);
    const baseText = text || "No Body";
    const enrichedText = baseText + pdfText;

    // Enrich HTML variant with PDF content for consistent downstream processing
    const baseHtml = html || textAsHtml || "";
    const enrichedHtml = baseHtml + (pdfText ? `<hr><pre>${escapeHtml(pdfText)}</pre>` : "");

    // Check for auto-reply headers to prevent loops
    if (this.isAutoReply(headers)) {
      logger.info({ subject, senderEmail }, "Ignoring auto-reply email");
      return;
    }

    // Get Gmail Thread ID if available (convert to string to handle BigInt)
    const gmailThreadId = safeHeaderValue(headers.get("x-gm-thrid"));
    const threadId = gmailThreadId || normalizedMessageId;

    // Get In-Reply-To for comment tracking
    const inReplyToValue = safeHeaderValue(headers.get("in-reply-to"));
    const normalizedInReplyTo = normalizeMessageId(inReplyToValue);

    // ─── SWITCHBOARD: Detect sender type ──────────────────────────────
    // NOTE: Sender identification relies on the From header, which is validated
    // upstream by the mail server's SPF/DKIM/DMARC checks. This is the same trust
    // model used by the entire IMAP service (ticket creation, customer replies, etc.).
    // Mitigation: All AI-created invoices require manual approval in the dashboard.
    const vendor = await this.findVendorByEmail(senderEmail);
    const utilityCompany = await this.findUtilityCompanyByEmail(senderEmail);

    if (vendor && utilityCompany) {
      logger.warn({ senderEmail }, 'Sender matched both vendor and utility company; preferring vendor');
    }

    const senderEntity = vendor || utilityCompany;
    const senderType: 'vendor' | 'utility' | null = vendor ? 'vendor' : utilityCompany ? 'utility' : null;

    const isVendor = !!vendor;
    const isUtility = !!utilityCompany;
    const hasPdf = this.hasPdfAttachment(parsed.attachments || []);

    // ─── SWITCHBOARD: Vendor/Utility with PDF ─────────────────────────
    if ((isVendor || isUtility) && hasPdf) {
      logger.info(
        { senderEmail, senderType, senderName: senderEntity!.name, hasPdf },
        'Switchboard: Vendor/Utility with PDF detected'
      );

      // Try to find existing ticket via [REQ-xxx] or triple-layer matching
      const reqReference = this.extractRequestReference(emailSubject);
      let matchedTicket: Ticket | null = null;

      if (reqReference) {
        matchedTicket = await this.findTicketByReference(reqReference);
        if (matchedTicket) {
          logger.info(
            { ticketId: matchedTicket.id, reqRef: reqReference },
            'Switchboard: Matched ticket via [REQ-xxx]'
          );
        }
      }

      if (!matchedTicket) {
        matchedTicket = await this.findMatchingTicket(headers, senderEmail, emailSubject);
      }

      if (matchedTicket) {
        // ─── PATH A: In-thread vendor/utility reply with PDF ──────
        const maintenanceStatus = matchedTicket.maintenanceStatus;
        const isInvoiceExpected = INVOICE_EXPECTED_STATUSES.includes(maintenanceStatus || '');

        if (isInvoiceExpected) {
          // ── PATH A — Invoice Expected: Enrich webhook, add invoice comment ──
          logger.info(
            {
              ticketId: matchedTicket.id,
              maintenanceStatus,
              senderType,
            },
            'Switchboard PATH A: Invoice expected — enriching webhook payload'
          );

          // Extract raw PDF buffers for direct OpenAI processing (no image conversion needed)
          const pdfAttachments: PdfAttachment[] = this._extractPdfAttachments(parsed);

          // Send PDFs directly to OpenAI Responses API (input_file) for classification + text extraction
          const { classification, extracted_text } = await OpenAIService.classifyAndExtract(pdfAttachments);

          logger.info(
            {
              ticketId: matchedTicket.id,
              documentType: classification.type,
              confidence: classification.confidence,
              textLength: extracted_text.length,
            },
            'PATH A: OpenAI Vision classification + text extraction complete'
          );

          const pdfFilenames = pdfAttachments.map((p) => p.filename).join(', ');

          // Create invoice-received comment (shows PDF name, not raw parsed text)
          const invoiceCommentText = `📄 Invoice received — ${pdfFilenames}`;

          const { comment, currentExternalIds } = await prisma.$transaction(async (tx) => {
            const createdComment = await tx.comment.create({
              data: {
                text: invoiceCommentText,
                userId: null,
                ticketId: matchedTicket!.id,
                reply: true,
                replyEmail: senderEmail,
                public: true,
                messageId: normalizedMessageId,
                inReplyTo: normalizedInReplyTo,
                senderRole: 'vendor',
              },
            });

            const updatedExternalIds = await ImapService.updateExternalIdsInTx(
              tx, matchedTicket!.id, normalizedMessageId
            );

            return { comment: createdComment, currentExternalIds: updatedExternalIds };
          });

          logger.info(
            { commentId: comment.id, ticketId: matchedTicket.id },
            'PATH A: Added invoice comment to ticket'
          );

          // Trigger enriched webhook to Flowise workflow
          const replyWebhooks = await prisma.webhooks.findMany({
            where: { type: 'ticket_reply_received', active: true },
          });

          await Promise.all(
            replyWebhooks.map(async (webhook) => {
              const message = {
                event: 'ticket_reply_received',
                ticketId: matchedTicket!.id,
                ticketTitle: matchedTicket!.title,
                commentId: comment.id,
                replyContent: invoiceCommentText,
                sender: {
                  type: senderType!,
                  email: senderEmail,
                  name: senderEntity!.name,
                },
                fromImap: true,
                externalIds: currentExternalIds,
                has_pdf: true,
                maintenance_status: maintenanceStatus,
                is_invoice_expected: true,
                document_classification: classification.type,
                document_confidence: classification.confidence,
                classification_signal: classification.key_signal,
                extracted_text: extracted_text,
                // uploads: uploads, // REMOVED
              };
              logger.info(
                { url: webhook.url, senderType, documentType: classification.type },
                'PATH A: Triggering enriched ticket_reply_received webhook'
              );
              await sendWebhookNotification(webhook, message);
            })
          );

          return; // Done — PATH A complete

        } else {
          // ── NOT invoice expected (quote/pending status) → Normal MOH flow ──
          logger.info(
            {
              ticketId: matchedTicket.id,
              maintenanceStatus,
              senderType,
            },
            'Switchboard: Quote/pending status — routing to normal MOH flow'
          );

          // Fall through to existing vendor reply behavior (comment + webhook without enrichment)
          const replyText = getReplyText({ text: baseText });
          const commentText = (replyText || baseText) + pdfText;

          const { comment, currentExternalIds } = await prisma.$transaction(async (tx) => {
            const createdComment = await tx.comment.create({
              data: {
                text: commentText,
                userId: null,
                ticketId: matchedTicket!.id,
                reply: true,
                replyEmail: senderEmail,
                public: true,
                messageId: normalizedMessageId,
                inReplyTo: normalizedInReplyTo,
                senderRole: 'vendor',
              },
            });

            const updatedExternalIds = await ImapService.updateExternalIdsInTx(
              tx, matchedTicket!.id, normalizedMessageId
            );

            return { comment: createdComment, currentExternalIds: updatedExternalIds };
          });

          const replyWebhooks = await prisma.webhooks.findMany({
            where: { type: 'ticket_reply_received', active: true },
          });

          await Promise.all(
            replyWebhooks.map(async (webhook) => {
              const message = {
                event: 'ticket_reply_received',
                ticketId: matchedTicket!.id,
                ticketTitle: matchedTicket!.title,
                commentId: comment.id,
                replyContent: commentText,
                sender: {
                  type: senderType!,
                  email: senderEmail,
                  name: senderEntity!.name,
                },
                fromImap: true,
                externalIds: currentExternalIds,
              };
              logger.info(
                { url: webhook.url },
                'Triggering ticket_reply_received webhook for vendor (MOH path)'
              );
              await sendWebhookNotification(webhook, message);
            })
          );

          return; // Done — MOH path
        }

      } else {
        // ─── PATH B: Standalone vendor/utility email with PDF (no ticket) ──
        logger.info(
          { senderEmail, senderType, senderName: senderEntity!.name },
          'Switchboard PATH B: Standalone invoice — no ticket, firing direct webhook'
        );

        // Log to Imap_Email for audit trail
        await prisma.imap_Email.create({
          data: {
            from: senderEmail,
            subject: emailSubject,
            body: baseText,
            html: baseHtml,
            text: baseText,
          },
        });

        // Extract raw PDF buffers for direct OpenAI processing (no image conversion needed)
        const pdfAttachments: PdfAttachment[] = this._extractPdfAttachments(parsed);

        // Send PDFs directly to OpenAI Responses API (input_file) for classification + text extraction
        const { classification, extracted_text } = await OpenAIService.classifyAndExtract(pdfAttachments);

        logger.info(
          {
            senderEmail,
            documentType: classification.type,
            confidence: classification.confidence,
          },
          'PATH B: OpenAI Vision classification + text extraction complete'
        );

        // ABORT if AI failed 
        if (classification.type === "ERROR") {
          logger.warn(
            { senderEmail, error: classification.key_signal },
            "PATH B: OpenAI Vision failed — skipping webhook trigger as per configuration"
          );
          return;
        }

        // Fire dedicated invoice_received webhook directly to UC3
        await this.fireInvoiceWebhook(
          senderEmail,
          emailSubject,
          baseText,
          baseHtml,
          parsed.date,
          senderEntity!,
          senderType!,
          classification,
          extracted_text
        );

        return; // STOP — no ticket creation for Path B
      }
    }

    // ─── Vendor/Utility WITHOUT PDF → existing vendor reply behavior ──
    if (isVendor || isUtility) {
      const reqReference = this.extractRequestReference(emailSubject);

      if (reqReference) {
        const ticket = await this.findTicketByReference(reqReference);

        if (ticket) {
          logger.info(
            { ticketId: ticket.id, senderName: senderEntity!.name, reqRef: reqReference },
            'Vendor/Utility email (no PDF) matched via [REQ-xxx] reference'
          );

          const replyText = getReplyText({ text: baseText });
          const commentText = (replyText || baseText) + pdfText;

          const { comment, currentExternalIds } = await prisma.$transaction(async (tx) => {
            const createdComment = await tx.comment.create({
              data: {
                text: commentText,
                userId: null,
                ticketId: ticket.id,
                reply: true,
                replyEmail: senderEmail,
                public: true,
                messageId: normalizedMessageId,
                inReplyTo: normalizedInReplyTo,
                senderRole: 'vendor',
              },
            });

            const updatedExternalIds = await ImapService.updateExternalIdsInTx(
              tx, ticket.id, normalizedMessageId
            );

            return { comment: createdComment, currentExternalIds: updatedExternalIds };
          });

          logger.info(
            { commentId: comment.id, ticketId: ticket.id },
            'Added vendor comment to ticket (no PDF — MOH path)'
          );

          const replyWebhooks = await prisma.webhooks.findMany({
            where: { type: 'ticket_reply_received', active: true },
          });

          await Promise.all(
            replyWebhooks.map(async (webhook) => {
              const message = {
                event: 'ticket_reply_received',
                ticketId: ticket.id,
                ticketTitle: ticket.title,
                commentId: comment.id,
                replyContent: commentText,
                sender: {
                  type: senderType!,
                  email: senderEmail,
                  name: senderEntity!.name,
                },
                fromImap: true,
                externalIds: currentExternalIds,
              };
              logger.info(
                { url: webhook.url },
                'Triggering ticket_reply_received webhook for vendor (no PDF)'
              );
              await sendWebhookNotification(webhook, message);
            })
          );

          return; // Done processing vendor/utility email (no PDF)
        } else {
          logger.warn(
            { reqRef: reqReference, senderEmail },
            'Vendor/Utility email has [REQ-xxx] but no matching ticket found — falling back to normal flow'
          );
        }
      } else {
        logger.info(
          { senderEmail, senderType },
          'Vendor/Utility email without [REQ-xxx] tag and no PDF — treating as normal customer email'
        );
      }
    }

    // ─── CUSTOMER (or vendor/utility fallback) → existing ticket flow ──
    const matchedTicket = await this.findMatchingTicket(
      headers,
      senderEmail,
      emailSubject
    );

    if (matchedTicket) {
      // Status-aware routing
      const closedStatuses: TicketStatus[] = ["done"];
      const shouldCreateNew =
        closedStatuses.includes(matchedTicket.status) || matchedTicket.locked;

      if (shouldCreateNew) {
        logger.info(
          { matchedTicketId: matchedTicket.id, status: matchedTicket.status },
          "Matched ticket is closed/locked - creating new linked ticket"
        );

        await this.createNewTicket(
          senderEmail,
          senderName,
          emailSubject,
          enrichedText,
          enrichedHtml,
          threadId,
          normalizedMessageId,
          { previous: matchedTicket.id }
        );
      } else {
        logger.info(
          { ticketId: matchedTicket.id },
          "Appending reply to existing ticket"
        );

        await this.appendCommentToTicket(
          matchedTicket,
          senderEmail,
          senderName,
          baseText,
          normalizedMessageId,
          normalizedInReplyTo,
          'customer',
          pdfText
        );

        await this.addMessageIdToTicket(matchedTicket.id, matchedTicket.externalIds, normalizedMessageId);
      }
    } else {
      logger.info({ senderEmail, subject }, "No matching ticket - creating new");

      await this.createNewTicket(
        senderEmail,
        senderName,
        emailSubject,
        enrichedText,
        enrichedHtml,
        threadId,
        normalizedMessageId,
        null
      );
    }
  }

  /**
   * Create a new ticket from an incoming email
   */
  private static async createNewTicket(
    senderEmail: string,
    senderName: string,
    subject: string,
    textContent: string,
    htmlContent: string,
    threadId: string | null,
    messageId: string | null,
    linked: { previous: string } | null
  ): Promise<void> {
    // Store raw email
    const imapEmail = await prisma.imap_Email.create({
      data: {
        from: senderEmail,
        subject: subject,
        body: textContent,
        html: htmlContent,
        text: htmlContent,
      },
    });

    // Create ticket with thread matching fields
    const ticket = await prisma.ticket.create({
      data: {
        email: senderEmail,
        name: senderName,
        title: subject,
        isComplete: false,
        priority: TicketPriority.LOW,
        fromImap: true,
        detail: htmlContent || textContent,
        threadId: threadId,
        externalIds: messageId ? [messageId] : [],
        ...(linked && { linked }),
      },
    });

    logger.info(
      { ticketId: ticket.id, threadId },
      "Created new ticket from email"
    );

    // Trigger customer_ticket_created webhook
    const customerWebhooks = await prisma.webhooks.findMany({
      where: { type: "customer_ticket_created", active: true },
    });

    await Promise.all(
      customerWebhooks.map(async (webhook) => {
        const message = {
          event: "customer_ticket_created",
          id: ticket.id,
          title: subject,
          content: textContent,
          htmlContent: htmlContent,
          email: senderEmail,
          name: senderName,
          priority: TicketPriority.LOW,
          fromImap: true,
          isCustomer: true,
          threadId: threadId,
        };
        logger.info(
          { url: webhook.url },
          "Triggering customer_ticket_created webhook"
        );
        await sendWebhookNotification(webhook, message);
      })
    );
  }

  /**
   * Append a comment to an existing ticket
   */
  private static async appendCommentToTicket(
    ticket: Ticket,
    senderEmail: string,
    senderName: string,
    textContent: string,
    messageId: string | null,
    inReplyTo: string | null,
    senderRole: 'customer' | 'vendor' | 'ai' | 'agent' = 'customer',
    pdfText: string = ""
  ): Promise<void> {
    // Parse reply from original email text (without PDF content to avoid distorting reply detection)
    const replyText = getReplyText({ text: textContent });
    const commentText = (replyText || textContent) + pdfText;

    const comment = await prisma.comment.create({
      data: {
        text: commentText,
        userId: null,
        ticketId: ticket.id,
        reply: true,
        replyEmail: senderEmail,
        public: true,
        messageId: messageId,
        inReplyTo: inReplyTo,
        senderRole: senderRole,
      },
    });

    logger.info(
      { commentId: comment.id, ticketId: ticket.id },
      "Added comment to ticket"
    );

    // Only fire webhook for external senders (customer / vendor / utility)
    // Support team (agent/AI) replies should not trigger external workflows
    if (senderRole === 'agent' || senderRole === 'ai') {
      logger.info(
        { ticketId: ticket.id, senderRole },
        'Skipping ticket_reply_received webhook — sender is support team'
      );
      return;
    }

    // Trigger ticket_reply_received webhook
    const replyWebhooks = await prisma.webhooks.findMany({
      where: { type: "ticket_reply_received", active: true },
    });

    await Promise.all(
      replyWebhooks.map(async (webhook) => {
        const message = {
          event: "ticket_reply_received",
          ticketId: ticket.id,
          ticketTitle: ticket.title,
          commentId: comment.id,
          replyContent: commentText,
          sender: {
            type: senderRole,
            email: senderEmail,
            name: senderName,
          },
          fromImap: true,
        };
        logger.info(
          { url: webhook.url },
          "Triggering ticket_reply_received webhook"
        );
        await sendWebhookNotification(webhook, message);
      })
    );
  }

  /**
   * Helper to wait for a specified duration
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if an error is retryable (timeout or connection error)
   */
  private static isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('etimedout') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('enetunreach') ||
      message.includes('ehostunreach')
    );
  }

  /**
   * Connect to IMAP with retry logic
   */
  private static async connectWithRetry(
    queue: EmailQueue,
    maxRetries: number = 3
  ): Promise<void> {
    const backoffDelays = [5000, 10000, 20000]; // 5s, 10s, 20s
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const imapConfig = await this.getImapConfig(queue);

        if (queue.serviceType === "other" && !imapConfig.password) {
          throw new Error("IMAP configuration is missing a password");
        }

        await new Promise((resolve, reject) => {
          // @ts-ignore
          const imap = new Imap(imapConfig);

          const cleanup = () => {
            try { imap.end(); } catch (e) { /* ignore */ }
          };

          imap.once("ready", () => {
            imap.openBox("INBOX", false, (err) => {
              if (err) {
                cleanup();
                reject(err);
                return;
              }
              imap.search(["UNSEEN"], (err, results) => {
                if (err) {
                  cleanup();
                  reject(err);
                  return;
                }
                if (!results?.length) {
                  imap.end();
                  resolve(null);
                  return;
                }

                const fetch = imap.fetch(results, { bodies: "" });

                fetch.on("message", (msg) => {
                  msg.on("body", (stream) => {
                    simpleParser(stream, async (err, parsed) => {
                      if (err) throw err;
                      await this.processEmail(parsed);
                    });
                  });

                  msg.once("attributes", (attrs) => {
                    imap.addFlags(attrs.uid, ["\\Seen"], () => { });
                  });
                });

                fetch.once("error", (err) => {
                  cleanup();
                  reject(err);
                });
                fetch.once("end", () => {
                  imap.end();
                  resolve(null);
                });
              });
            });
          });

          imap.once("error", (err) => {
            cleanup();
            reject(err);
          });
          imap.once("end", () => {
            resolve(null);
          });

          imap.connect();
        });

        // Success - exit the retry loop
        return;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if we should retry
        if (attempt < maxRetries && this.isRetryableError(lastError)) {
          const delay = backoffDelays[attempt] || 20000;
          logger.warn({
            queueId: queue.id,
            attempt: attempt + 1,
            maxRetries,
            delayMs: delay,
            errorMessage: lastError.message,
          }, `IMAP connection failed, retrying in ${delay / 1000}s...`);

          await this.delay(delay);
          continue;
        }

        // Non-retryable error or max retries exceeded
        throw lastError;
      }
    }
  }

  /**
   * Fetch emails from all configured IMAP queues
   */
  static async fetchEmails(): Promise<void> {
    const queues =
      (await prisma.emailQueue.findMany()) as unknown as EmailQueue[];

    for (const queue of queues) {
      try {
        await this.connectWithRetry(queue, 3);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        logger.error({
          errorMessage,
          errorStack,
          queueId: queue.id,
          username: queue.username,
          serviceType: queue.serviceType
        }, "Error processing queue (all retries exhausted)");
      }
    }
  }
}

