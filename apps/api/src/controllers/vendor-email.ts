import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../prisma";
import { checkSession } from "../lib/session";
import { requirePermission } from "../lib/roles";
import { sendComment } from "../lib/nodemailer/ticket/comment";
import { IVendorEmailBody } from "../lib/types/request";


/**
 * Validates email format
 */
const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

/**
 * Vendor email routes
 * Handles sending emails to vendors with automatic [REQ-xxx] prefix
 */
export function vendorEmailRoutes(fastify: FastifyInstance) {
    /**
     * POST /api/v1/ticket/vendor-email
     * Send email to vendor and append to ticket as comment
     */
    fastify.post<{ Body: IVendorEmailBody }>(
        "/api/v1/ticket/vendor-email",
        {
            preHandler: requirePermission(["issue::comment"]),
            schema: {
                description: 'Send an email to a vendor and append it as a comment to the ticket',
                tags: ['Ticket'],
                body: {
                    type: 'object',
                    required: ['ticketId', 'vendorEmail', 'subject', 'body'],
                    properties: {
                        ticketId: { type: 'string', description: 'The unique ID of the ticket' },
                        vendorEmail: { type: 'string', format: 'email', description: 'Recipient vendor email address' },
                        subject: { type: 'string', description: 'Email subject (Peppermint will prepend [REQ-xxx])' },
                        body: { type: 'string', description: 'Email body content' }
                    }
                },
                response: {
                    200: {
                        type: 'object',
                        properties: {
                            success: { type: 'boolean' },
                            messageId: { type: 'string' },
                            message: { type: 'string' }
                        }
                    }
                }
            } as any
        },


        async (request, reply) => {
            const { ticketId, vendorEmail, subject, body } = request.body;

            // Input validation
            if (!ticketId || !vendorEmail || !subject || !body) {
                return reply.status(400).send({
                    success: false,
                    message: "Missing required fields: ticketId, vendorEmail, subject, body",
                });
            }

            if (!isValidEmail(vendorEmail)) {
                return reply.status(400).send({
                    success: false,
                    message: "Invalid vendor email format",
                });
            }

            try {
                // Get authenticated user
                const user = await checkSession(request);
                if (!user) {
                    return reply.status(401).send({
                        success: false,
                        message: "Unauthorized",
                    });
                }

                // Verify ticket exists
                const ticket = await prisma.ticket.findUnique({
                    where: { id: ticketId },
                    select: {
                        id: true,
                        title: true,
                        externalIds: true,
                    },
                });

                if (!ticket) {
                    return reply.status(404).send({
                        success: false,
                        message: `Ticket not found: ${ticketId}`,
                    });
                }

                // Send email with [REQ-xxx] prefix (handled by sendComment)
                const sentMessageId = await sendComment({
                    comment: body,
                    title: subject,
                    ticketId: ticket.id,
                    email: vendorEmail,
                    originalSubject: subject,
                    inReplyTo: undefined,
                    references: ticket.externalIds || [],
                    isVendorEmail: true, // Triggers [REQ-xxx] prefix
                });

                // Create comment on ticket to track the sent email
                await prisma.comment.create({
                    data: {
                        text: body,
                        public: true,
                        ticketId: ticket.id,
                        userId: user.id,
                        senderRole: "agent", // Authenticated user = agent
                    },
                });

                // Store Message-ID for reply threading
                if (sentMessageId) {
                    const updatedExternalIds = [
                        ...new Set([...(ticket.externalIds || []), sentMessageId]),
                    ];

                    await prisma.ticket.update({
                        where: { id: ticket.id },
                        data: { externalIds: updatedExternalIds },
                    });
                }

                return reply.send({
                    success: true,
                    messageId: sentMessageId,
                    message: "Vendor email sent successfully",
                });
            } catch (error) {
                console.error("Error sending vendor email:", error);

                return reply.status(500).send({
                    success: false,
                    message: "Failed to send vendor email",
                    error: error instanceof Error ? error.message : "Unknown error",
                });
            }
        }
    );
}
