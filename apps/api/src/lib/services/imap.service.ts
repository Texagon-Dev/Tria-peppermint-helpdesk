import EmailReplyParser from "email-reply-parser";
import Imap from "imap";
import { simpleParser, ParsedMail, Headers } from "mailparser";
import { prisma } from "../../prisma";
import { EmailConfig, EmailQueue } from "../types/email";
import { AuthService } from "./auth.service";
import { sendWebhookNotification } from "../notifications/webhook";
import { TicketPriority } from "../types/ticket";
import pino from "pino";
import { Ticket, TicketStatus, Webhooks } from "@prisma/client";

const logger = pino();

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

export class ImapService {
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
    const autoSubmitted = headers.get("auto-submitted");
    const xAutoResponse = headers.get("x-auto-response-suppress");
    const xPeppermintAI = headers.get("x-peppermint-ai");
    const precedence = headers.get("precedence");
    const xAutoReply = headers.get("x-autoreply");
    const xMsExchangeAuto = headers.get("x-ms-exchange-auto-submissions");

    return (
      (typeof autoSubmitted === "string" && autoSubmitted !== "no") ||
      !!xAutoResponse ||
      xPeppermintAI === "true" ||
      ["bulk", "list", "auto_reply"].includes(precedence as string) ||
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
    const gmailThreadId = headers.get("x-gm-thrid");
    if (!gmailThreadId || typeof gmailThreadId !== "string") return null;

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
    const referencesRaw = headers.get("references");
    const inReplyToRaw = headers.get("in-reply-to");

    // Parse References header (space-separated list of Message-IDs)
    let references: string[] = [];
    if (typeof referencesRaw === "string") {
      references = referencesRaw.split(/\s+/).filter(Boolean);
    }

    // Add In-Reply-To if present
    const inReplyTo =
      typeof inReplyToRaw === "string" ? inReplyToRaw : undefined;

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
        "Layer 3: Matched by subject + sender heuristics"
      );
    }
    return ticket;
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

    // Layer 3: Heuristics - Subject + Sender (Medium accuracy, fallback only)
    ticket = await this.matchByHeuristics(from, subject);
    return ticket;
  }

  /**
   * Process an incoming email - either append to existing ticket or create new
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

    // Check for auto-reply headers to prevent loops
    if (this.isAutoReply(headers)) {
      logger.info({ subject, senderEmail }, "Ignoring auto-reply email");
      return;
    }

    // Get Gmail Thread ID if available
    const gmailThreadId = headers.get("x-gm-thrid");
    const threadId =
      typeof gmailThreadId === "string"
        ? gmailThreadId
        : normalizedMessageId;

    // Get In-Reply-To for comment tracking
    const inReplyToRaw = headers.get("in-reply-to");
    const normalizedInReplyTo = normalizeMessageId(
      typeof inReplyToRaw === "string" ? inReplyToRaw : null
    );

    // Try to find an existing ticket using triple-layer matching
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

        // Create new ticket linked to the old one
        await this.createNewTicket(
          senderEmail,
          senderName,
          emailSubject,
          text || "No Body",
          html || textAsHtml || "",
          threadId,
          normalizedMessageId,
          { previous: matchedTicket.id } // Link to previous ticket
        );
      } else {
        // Append as comment to existing ticket
        logger.info(
          { ticketId: matchedTicket.id },
          "Appending reply to existing ticket"
        );

        await this.appendCommentToTicket(
          matchedTicket,
          senderEmail,
          senderName,
          text || "No Body",
          normalizedMessageId,
          normalizedInReplyTo
        );

        // Update ticket's externalIds to include this message
        if (normalizedMessageId) {
          const updatedExternalIds = [
            ...new Set([...matchedTicket.externalIds, normalizedMessageId]),
          ];
          await prisma.ticket.update({
            where: { id: matchedTicket.id },
            data: { externalIds: updatedExternalIds },
          });
        }
      }
    } else {
      // No matching ticket found - create new
      logger.info({ senderEmail, subject }, "No matching ticket - creating new");

      await this.createNewTicket(
        senderEmail,
        senderName,
        emailSubject,
        text || "No Body",
        html || textAsHtml || "",
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
    inReplyTo: string | null
  ): Promise<void> {
    const replyText = getReplyText({ text: textContent });

    const comment = await prisma.comment.create({
      data: {
        text: replyText || textContent,
        userId: null,
        ticketId: ticket.id,
        reply: true,
        replyEmail: senderEmail,
        public: true,
        messageId: messageId,
        inReplyTo: inReplyTo,
      },
    });

    logger.info(
      { commentId: comment.id, ticketId: ticket.id },
      "Added comment to ticket"
    );

    // Trigger customer_reply_received webhook
    const replyWebhooks = await prisma.webhooks.findMany({
      where: { type: "customer_reply_received", active: true },
    });

    await Promise.all(
      replyWebhooks.map(async (webhook) => {
        const message = {
          event: "customer_reply_received",
          ticketId: ticket.id,
          ticketTitle: ticket.title,
          commentId: comment.id,
          replyContent: replyText || textContent,
          customerEmail: senderEmail,
          customerName: senderName,
          isCustomer: true,
          fromImap: true,
        };
        logger.info(
          { url: webhook.url },
          "Triggering customer_reply_received webhook"
        );
        await sendWebhookNotification(webhook, message);
      })
    );
  }

  /**
   * Fetch emails from all configured IMAP queues
   */
  static async fetchEmails(): Promise<void> {
    const queues =
      (await prisma.emailQueue.findMany()) as unknown as EmailQueue[];
    const today = new Date();

    for (const queue of queues) {
      try {
        const imapConfig = await this.getImapConfig(queue);

        if (queue.serviceType === "other" && !imapConfig.password) {
          logger.error("IMAP configuration is missing a password");
          throw new Error("IMAP configuration is missing a password");
        }

        // @ts-ignore
        const imap = new Imap(imapConfig);

        await new Promise((resolve, reject) => {
          imap.once("ready", () => {
            imap.openBox("INBOX", false, (err) => {
              if (err) {
                reject(err);
                return;
              }
              imap.search(["UNSEEN", ["ON", today]], (err, results) => {
                if (err) reject(err);
                if (!results?.length) {
                  logger.info("No new messages");
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
                    imap.addFlags(attrs.uid, ["\\Seen"], () => {
                      logger.info("Marked as read!");
                    });
                  });
                });

                fetch.once("error", reject);
                fetch.once("end", () => {
                  logger.info("Done fetching messages");
                  imap.end();
                  resolve(null);
                });
              });
            });
          });

          imap.once("error", reject);
          imap.once("end", () => {
            logger.info("Connection ended");
            resolve(null);
          });

          imap.connect();
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        logger.error({
          errorMessage,
          errorStack,
          queueId: queue.id,
          username: queue.username,
          serviceType: queue.serviceType
        }, "Error processing queue");
      }
    }
  }
}

