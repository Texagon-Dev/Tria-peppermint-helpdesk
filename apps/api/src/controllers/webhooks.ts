import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { track } from "../lib/hog";
import { requirePermission } from "../lib/roles";
import { checkSession } from "../lib/session";
import { prisma } from "../prisma";

export function webhookRoutes(fastify: FastifyInstance) {
  // Create a new webhook
  fastify.post(
    "/api/v1/webhook/create",
    {
      preHandler: requirePermission(["webhook::create"]),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = await checkSession(request);
      const { name, url, type, active, secret }: any = request.body;
      await prisma.webhooks.create({
        data: {
          name,
          url,
          type,
          active,
          secret,
          createdBy: user!.id,
        },
      });

      const client = track();

      client.capture({
        event: "webhook_created",
        distinctId: "uuid",
      });

      client.shutdownAsync();

      reply.status(200).send({ message: "Hook created!", success: true });
    }
  );

  // Get all webhooks
  fastify.get(
    "/api/v1/webhooks/all",
    {
      preHandler: requirePermission(["webhook::read"]),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const webhooks = await prisma.webhooks.findMany({});

      reply.status(200).send({ webhooks: webhooks, success: true });
    }
  );

  // Delete a webhook
  fastify.delete(
    "/api/v1/admin/webhook/:id/delete",
    {
      preHandler: requirePermission(["webhook::delete"]),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id }: any = request.params;
      await prisma.webhooks.delete({
        where: {
          id: id,
        },
      });

      reply.status(200).send({ success: true });
    }
  );

  // Update a webhook
  fastify.put(
    "/api/v1/admin/webhook/:id/update",
    {
      preHandler: requirePermission(["webhook::create"]),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id }: any = request.params;
      const { name, url, type, active, secret }: any = request.body;

      const updated = await prisma.webhooks.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(url !== undefined && { url }),
          ...(type !== undefined && { type }),
          ...(active !== undefined && { active }),
          ...(secret !== undefined && { secret }),
        },
      });

      reply
        .status(200)
        .send({ message: "Webhook updated!", success: true, webhook: updated });
    }
  );
}
