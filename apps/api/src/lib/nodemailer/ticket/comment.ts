import handlebars from "handlebars";
import { prisma } from "../../../prisma";
import { createTransportProvider } from "../transport";

export interface CommentEmailOptions {
  comment: string;
  title: string;
  ticketId: string;
  email: string;
  originalSubject?: string;
  inReplyTo?: string;
  references?: string[];
}

export async function sendComment(options: CommentEmailOptions): Promise<string | null> {
  const { comment, title, ticketId, email, originalSubject, inReplyTo, references } = options;

  try {
    const provider = await prisma.email.findFirst();

    const transport = await createTransportProvider();

    const testhtml = await prisma.emailTemplate.findFirst({
      where: {
        type: "ticket_comment",
      },
    });

    var template = handlebars.compile(testhtml?.html);
    var replacements = {
      title: title,
      comment: comment,
    };
    var htmlToSend = template(replacements);

    // Build subject - use Re: prefix if we have original subject
    const subject = originalSubject
      ? `Re: ${originalSubject.replace(/^(Re:\s*)+/i, '')}` // Remove existing Re: prefixes
      : `New comment on Issue #${title} ref: #${ticketId}`;

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
      from: provider?.reply,
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
