import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { validateApiKey } from "../lib/api-key";
import { requireAdmin } from "../lib/session";
import { handleMcpRequest } from "./protocol";

// =============================================================================
// AUTH — same as domus.ts search routes
// =============================================================================

async function requireAdminOrApiKey(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const apiKeyResult = await validateApiKey(request);
  if (apiKeyResult) return;
  return requireAdmin(request, reply);
}

// =============================================================================
// MCP ROUTES — mounted on the main Peppermint API Fastify instance
// =============================================================================

export function mcpRoutes(fastify: FastifyInstance) {
  // GET /mcp — SSE stream (Streamable HTTP transport handshake)
  fastify.get(
    "/mcp",
    { preHandler: requireAdminOrApiKey },
    async (request: FastifyRequest, reply: FastifyReply) => {
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      reply.raw.write('event: open\ndata: {"status":"connected"}\n\n');

      const keepalive = setInterval(() => {
        reply.raw.write(":keepalive\n\n");
      }, 30000);

      const timeout = setTimeout(() => {
        clearInterval(keepalive);
        reply.raw.write(
          'event: close\ndata: {"reason":"max_duration_reached"}\n\n'
        );
        reply.raw.end();
      }, 1800000); // 30 min

      request.raw.on("close", () => {
        clearInterval(keepalive);
        clearTimeout(timeout);
      });
    }
  );

  // POST /mcp — JSON-RPC 2.0 handler (initialize, tools/list, tools/call)
  fastify.post(
    "/mcp",
    { preHandler: requireAdminOrApiKey },
    async (request: FastifyRequest) => {
      return handleMcpRequest(request.body);
    }
  );
}
