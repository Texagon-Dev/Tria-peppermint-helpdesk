import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../prisma";
import { checkSession } from "../lib/session";
import { requirePermission } from "../lib/roles";
import { sendComment } from "../lib/nodemailer/ticket/comment";
import { IVendorEmailBody } from "../lib/types/request";

/**
 * Vendor email routes
 * Handles sending emails to vendors with automatic [REQ-xxx] prefix
 */
export function vendorEmailRoutes(fastify: FastifyInstance) {
    /**
     * POST /api/v1/ticket/vendor-email
     * Send email to vendor and append to ticket as comment
     * 
     * Note: Fastify validates required fields and email format via schema.
     * Manual validation removed to avoid drift with schema definition.
     */
    fastify.post<{ Body: IVendorEmailBody }>(
        "/api/v1/ticket/vendor-email",
        {
            preHandler: requirePermission(["issue::comment"]),
            schema: {
                body: {
                    type: 'object',
                    required: ['ticketId', 'vendorEmail', 'subject', 'body'],
                    properties: {
                        ticketId: { type: 'string', minLength: 1 },
                        vendorEmail: { type: 'string', format: 'email' },
                        subject: { type: 'string', minLength: 1 },
                        body: { type: 'string', minLength: 1 }
                    }
                }
            }
        },

        async (request, reply) => {
            // Schema validation ensures all fields are present and valid
            const { ticketId, vendorEmail, subject, body } = request.body;

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

                // Use transaction for atomicity: comment + externalIds update
                // This prevents race conditions when multiple vendor emails are sent concurrently
                await prisma.$transaction(async (tx) => {
                    // Create comment to track the sent email
                    // Note: public: false for outbound vendor emails (agent-initiated, may contain internal context)
                    // This differs from inbound emails which use public: true
                    await tx.comment.create({
                        data: {
                            text: body,
                            public: false,
                            ticketId: ticket.id,
                            userId: user.id,
                            senderRole: "agent",
                            replyEmail: vendorEmail, // Store recipient for audit trail
                        },
                    });

                    // Store Message-ID for reply threading
                    if (sentMessageId) {
                        // Re-fetch within transaction to avoid stale data (concurrency-safe)
                        const current = await tx.ticket.findUnique({
                            where: { id: ticket.id },
                            select: { externalIds: true },
                        });

                        const updatedExternalIds = [
                            ...new Set([...(current?.externalIds || []), sentMessageId]),
                        ];

                        await tx.ticket.update({
                            where: { id: ticket.id },
                            data: { externalIds: updatedExternalIds },
                        });
                    }
                });

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
