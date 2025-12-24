import EmailReplyParser from "email-reply-parser";
import Imap from "imap";
import { simpleParser } from "mailparser";
import { prisma } from "../../prisma";
import { EmailConfig, EmailQueue } from "../types/email";
import { AuthService } from "./auth.service";
import { sendWebhookNotification } from "../notifications/webhook";

function getReplyText(email: any): string {
  const parsed = new EmailReplyParser().read(email.text);
  const fragments = parsed.getFragments();

  let replyText = "";

  fragments.forEach((fragment: any) => {
    console.log("FRAGMENT", fragment._content, fragment.content);
    if (!fragment._isHidden && !fragment._isSignature && !fragment._isQuoted) {
      replyText += fragment._content;
    }
  });

  return replyText;
}

export class ImapService {
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

  private static async processEmail(
    parsed: any,
    isReply: boolean
  ): Promise<void> {
    const { from, subject, text, html, textAsHtml } = parsed;

    console.log("isReply", isReply);

    let handledAsReply = false;

    if (isReply) {
      // First try to match UUID format
      const uuidMatch = subject.match(
        /(?:ref:|#)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
      );
      console.log("UUID MATCH", uuidMatch);

      const ticketId = uuidMatch?.[1];

      console.log("TICKET ID", ticketId);

      if (ticketId) {
        const ticket = await prisma.ticket.findFirst({
          where: {
            id: ticketId,
          },
        });

        console.log("TICKET", ticket);

        if (ticket) {
          // Found the ticket - add as comment
          const replyText = getReplyText(parsed);

          const comment = await prisma.comment.create({
            data: {
              text: text ? replyText : "No Body",
              userId: null,
              ticketId: ticket.id,
              reply: true,
              replyEmail: from.value[0].address,
              public: true,
            },
          });

          // Trigger customer_reply_received webhook
          const replyWebhooks = await prisma.webhooks.findMany({
            where: { type: "customer_reply_received" },
          });

          for (const webhook of replyWebhooks) {
            if (webhook.active) {
              const message = {
                event: "customer_reply_received",
                ticketId: ticket.id,
                ticketTitle: ticket.title,
                commentId: comment.id,
                replyContent: text ? replyText : "No Body",
                customerEmail: from.value[0].address,
                customerName: from.value[0].name || "",
                isCustomer: true,
                fromImap: true,
              };
              console.log("Triggering customer_reply_received webhook:", webhook.url);
              await sendWebhookNotification(webhook, message);
            }
          }

          handledAsReply = true;
        } else {
          console.warn(`Ticket not found: ${ticketId}. Creating as new ticket.`);
        }
      } else {
        console.warn(`Could not extract ticket ID from subject: ${subject}. Creating as new ticket.`);
      }
    }

    // If not a reply OR couldn't process as reply, create as new ticket
    if (!handledAsReply) {
      const imapEmail = await prisma.imap_Email.create({
        data: {
          from: from.value[0].address,
          subject: subject || "No Subject",
          body: text || "No Body",
          html: html || "",
          text: textAsHtml,
        },
      });

      const ticket = await prisma.ticket.create({
        data: {
          email: from.value[0].address,
          name: from.value[0].name,
          title: imapEmail.subject || "-",
          isComplete: false,
          priority: "low",
          fromImap: true,
          detail: html || textAsHtml,
        },
      });

      // Trigger customer_ticket_created webhook
      const customerWebhooks = await prisma.webhooks.findMany({
        where: { type: "customer_ticket_created" },
      });

      for (const webhook of customerWebhooks) {
        if (webhook.active) {
          const message = {
            event: "customer_ticket_created",
            id: ticket.id,
            title: imapEmail.subject || "-",
            content: text || "No Body",
            htmlContent: html || textAsHtml,
            email: from.value[0].address,
            name: from.value[0].name || "",
            priority: "low",
            fromImap: true,
            isCustomer: true,
          };
          console.log("Triggering customer_ticket_created webhook:", webhook.url);
          await sendWebhookNotification(webhook, message);
        }
      }
    }
  }



  static async fetchEmails(): Promise<void> {
    const queues =
      (await prisma.emailQueue.findMany()) as unknown as EmailQueue[];
    const today = new Date();

    for (const queue of queues) {
      try {
        const imapConfig = await this.getImapConfig(queue);

        if (queue.serviceType === "other" && !imapConfig.password) {
          console.error("IMAP configuration is missing a password");
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
                  console.log("No new messages");
                  imap.end();
                  resolve(null);
                  return;
                }

                const fetch = imap.fetch(results, { bodies: "" });

                fetch.on("message", (msg) => {
                  msg.on("body", (stream) => {
                    simpleParser(stream, async (err, parsed) => {
                      if (err) throw err;
                      const subjectLower = parsed.subject?.toLowerCase() || "";
                      const isReply =
                        subjectLower.includes("re:") ||
                        subjectLower.includes("ref:");
                      await this.processEmail(parsed, isReply || false);
                    });
                  });

                  msg.once("attributes", (attrs) => {
                    imap.addFlags(attrs.uid, ["\\Seen"], () => {
                      console.log("Marked as read!");
                    });
                  });
                });

                fetch.once("error", reject);
                fetch.once("end", () => {
                  console.log("Done fetching messages");
                  imap.end();
                  resolve(null);
                });
              });
            });
          });

          imap.once("error", reject);
          imap.once("end", () => {
            console.log("Connection ended");
            resolve(null);
          });

          imap.connect();
        });
      } catch (error) {
        console.error(`Error processing queue ${queue.id}:`, error);
      }
    }
  }
}
