import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { generateApiKey, hashApiKey } from "../lib/api-key";
import { track } from "../lib/hog";
import { requirePermission } from "../lib/roles";
import { checkSession } from "../lib/session";
import { prisma } from "../prisma";

export function apiKeyRoutes(fastify: FastifyInstance) {
    // Create a new API key (admin only)
    fastify.post(
        "/api/v1/api-keys",
        {
            preHandler: requirePermission(["apikey::create"]),
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const user = await checkSession(request);
            if (!user) {
                return reply.status(401).send({ success: false, message: "Unauthorized" });
            }

            const { name, permissions, expiresAt }: any = request.body;

            if (!name) {
                return reply.status(400).send({ success: false, message: "Name is required" });
            }

            // Generate the API key
            const { rawKey, prefix } = generateApiKey();
            const hashedKey = hashApiKey(rawKey);

            // Create the API key record
            const apiKey = await prisma.apiKey.create({
                data: {
                    name,
                    key: hashedKey,
                    prefix,
                    userId: user.id,
                    permissions: permissions || [],
                    expiresAt: expiresAt ? new Date(expiresAt) : null,
                },
            });

            const client = track();

            client.capture({
                event: "api_key_created",
                distinctId: user.id,
            });

            client.shutdownAsync();

            // Return the raw key ONLY on creation (never shown again)
            reply.status(201).send({
                success: true,
                apiKey: {
                    id: apiKey.id,
                    name: apiKey.name,
                    prefix: apiKey.prefix,
                    key: rawKey, // Only returned on creation!
                    permissions: apiKey.permissions,
                    createdAt: apiKey.createdAt,
                    expiresAt: apiKey.expiresAt,
                },
                message: "API key created. Copy it now - you won't see it again!",
            });
        }
    );

    // Get all API keys for the current user (masked)
    fastify.get(
        "/api/v1/api-keys",
        {
            preHandler: requirePermission(["apikey::read"]),
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const user = await checkSession(request);
            if (!user) {
                return reply.status(401).send({ success: false, message: "Unauthorized" });
            }

            // Get all API keys (for admins, show all; otherwise just user's own)
            const apiKeys = await prisma.apiKey.findMany({
                where: user.isAdmin ? {} : { userId: user.id },
                select: {
                    id: true,
                    name: true,
                    prefix: true,
                    permissions: true,
                    active: true,
                    lastUsedAt: true,
                    expiresAt: true,
                    createdAt: true,
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                },
                orderBy: { createdAt: "desc" },
            });

            reply.status(200).send({ success: true, apiKeys });
        }
    );

    // Delete/revoke an API key
    fastify.delete(
        "/api/v1/api-keys/:id",
        {
            preHandler: requirePermission(["apikey::delete"]),
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const user = await checkSession(request);
            if (!user) {
                return reply.status(401).send({ success: false, message: "Unauthorized" });
            }

            const { id }: any = request.params;

            // Check if API key exists and user has permission to delete it
            const apiKey = await prisma.apiKey.findUnique({
                where: { id },
            });

            if (!apiKey) {
                return reply.status(404).send({ success: false, message: "API key not found" });
            }

            // Only allow deletion if user owns the key or is admin
            if (apiKey.userId !== user.id && !user.isAdmin) {
                return reply.status(403).send({ success: false, message: "Forbidden" });
            }

            await prisma.apiKey.delete({
                where: { id },
            });

            const client = track();

            client.capture({
                event: "api_key_deleted",
                distinctId: user.id,
            });

            client.shutdownAsync();

            reply.status(200).send({ success: true, message: "API key deleted" });
        }
    );

    // Toggle API key active status
    fastify.patch(
        "/api/v1/api-keys/:id/toggle",
        {
            preHandler: requirePermission(["apikey::manage"]),
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const user = await checkSession(request);
            if (!user) {
                return reply.status(401).send({ success: false, message: "Unauthorized" });
            }

            const { id }: any = request.params;

            const apiKey = await prisma.apiKey.findUnique({
                where: { id },
            });

            if (!apiKey) {
                return reply.status(404).send({ success: false, message: "API key not found" });
            }

            if (apiKey.userId !== user.id && !user.isAdmin) {
                return reply.status(403).send({ success: false, message: "Forbidden" });
            }

            const updated = await prisma.apiKey.update({
                where: { id },
                data: { active: !apiKey.active },
            });

            reply.status(200).send({
                success: true,
                active: updated.active,
                message: updated.active ? "API key activated" : "API key deactivated",
            });
        }
    );
}
