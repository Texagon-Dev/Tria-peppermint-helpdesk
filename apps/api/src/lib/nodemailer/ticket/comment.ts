import handlebars from "handlebars";
import { prisma } from "../../../prisma";
import { createTransportProvider } from "../transport";
import { convertMarkdownToHtmlSync } from "../utils/markdown";
import { TICKET_REFERENCE_LENGTH } from "../../constants";

export interface CommentEmailOptions {
  comment: string;
  title: string;
  ticketId: string;
  email: string;
  originalSubject?: string;
  inReplyTo?: string;
  references?: string[];
  isVendorEmail?: boolean;  // If true, add [REQ-xxx] to subject
}

export async function sendComment(options: CommentEmailOptions): Promise<string | null> {
  const { comment, title, ticketId, email, originalSubject, inReplyTo, references } = options;

  try {
    // Look up ticket's source queue for reply-from-receiving-inbox
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { sourceQueueId: true },
    });

    let fromAddress: string | undefined;
    if (ticket?.sourceQueueId) {
      const queue = await prisma.emailQueue.findFirst({ where: { id: ticket.sourceQueueId } });
      if (queue) fromAddress = queue.username;
    }

    // Fall back to Email table for from address
    if (!fromAddress) {
      const provider = await prisma.email.findFirst();
      fromAddress = provider?.reply;
    }

    const transport = await createTransportProvider(ticket?.sourceQueueId ?? undefined);

    const testhtml = await prisma.emailTemplate.findFirst({
      where: {
        type: "ticket_comment",
      },
    });

    var template = handlebars.compile(testhtml?.html);
    // Convert markdown to HTML for proper email rendering
    var replacements = {
      title: title,
      comment: convertMarkdownToHtmlSync(comment),
    };
    var htmlToSend = template(replacements);

    // Build subject with [REQ-xxx] reference for Layer 2.5 thread matching
    const refTag = `[REQ-${ticketId.slice(0, TICKET_REFERENCE_LENGTH)}] `;
    const subject = originalSubject
      ? `${refTag}Re: ${originalSubject.replace(/^(Re:\s*)+/i, '')}` // Remove existing Re: prefixes
      : `${refTag}New comment on Issue #${title} ref: #${ticketId}`;

    // Build headers for email threading
    const headers: Record<string, string> = {
      'X-Peppermint-AI': 'true', // For loop prevention
    };

    if (inReplyTo) {
      // Format Message-ID with angle brackets if not present
      headers['In-Reply-To'] = inReplyTo.startsWith('<') ? inReplyTo : `<${inReplyTo}>`;
    }

    if (references && references.length > 0) {
      // Build References header - chain of all Message-IDs
      headers['References'] = references
        .map(r => r.startsWith('<') ? r : `<${r}>`)
        .join(' ');
    }

    console.log("Sending email to:", email, "Subject:", subject);
    console.log("Threading headers:", headers);

    const info = await transport.sendMail({
      from: fromAddress,
      to: email,
      subject: subject,
      text: `Hello there, Issue #${title}, has had an update with a comment of ${comment}`,
      html: htmlToSend,
      headers: headers,
    });

    console.log("Message sent:", info.messageId);

    // Return the Message-ID for storing in ticket's externalIds
    return info.messageId ? info.messageId.replace(/[<>]/g, '') : null;
  } catch (error) {
    console.error("Error sending comment email:", error);
    return null;
  }
}
