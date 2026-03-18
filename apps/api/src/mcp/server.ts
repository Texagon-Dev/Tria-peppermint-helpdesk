import Fastify from "fastify";
import axios from "axios";
import { tools, toolsByName } from "./tools";
import { handleMcpRequest } from "./protocol";

// =============================================================================
// CONFIG
// =============================================================================

const MCP_PORT = parseInt(process.env.MCP_PORT || "5004", 10);
const MCP_API_KEY = process.env.MCP_API_KEY || "";

// =============================================================================
// FASTIFY INSTANCE
// =============================================================================

const fastify = Fastify({ logger: true });

// =============================================================================
// AUTH MIDDLEWARE
// =============================================================================

function validateMcpKey(request: any, reply: any, done: any) {
  const key = request.headers["x-mcp-api-key"];
  if (!MCP_API_KEY) {
    // No key configured — skip auth (dev mode)
    return done();
  }
  if (key !== MCP_API_KEY) {
    reply.status(401).send({ error: "Invalid or missing MCP API key" });
    return;
  }
  done();
}

// =============================================================================
// REST ENDPOINTS (direct testing / non-Flowise consumers)
// =============================================================================

// Health check — no auth
fastify.get("/health", async () => {
  return { status: "ok", platform: "domus" };
});

// List tools
fastify.get(
  "/tools",
  { preHandler: validateMcpKey },
  async () => {
    return {
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    };
  }
);

// Execute tool
fastify.post(
  "/execute",
  { preHandler: validateMcpKey },
  async (request, reply) => {
    const { tool_name, parameters } = request.body as {
      tool_name: string;
      parameters: Record<string, string>;
    };

    if (!tool_name) {
      return reply.status(400).send({ error: "tool_name is required" });
    }

    const tool = toolsByName.get(tool_name);
    if (!tool) {
      return reply.status(404).send({
        error: `Unknown tool: ${tool_name}`,
        available_tools: tools.map((t) => t.name),
      });
    }

    // Validate required parameters
    for (const [paramName, paramDef] of Object.entries(tool.parameters)) {
      if (paramDef.required && !parameters?.[paramName]) {
        return reply.status(400).send({
          error: `Missing required parameter: ${paramName}`,
          tool_name,
        });
      }
    }

    try {
      const result = await tool.execute(parameters || {});
      return {
        success: true,
        result,
        tool_name,
        platform: "domus",
      };
    } catch (err: any) {
      if (axios.isAxiosError(err)) {
        return reply.status(err.response?.status || 500).send({
          success: false,
          error: err.response?.data?.error || err.message,
          tool_name,
          platform: "domus",
        });
      }
      return reply.status(500).send({
        success: false,
        error: err.message,
        tool_name,
        platform: "domus",
      });
    }
  }
);

// =============================================================================
// MCP PROTOCOL ENDPOINTS (For Flowise Custom MCP Integration)
// =============================================================================
// Implements JSON-RPC 2.0 over Streamable HTTP transport so that Flowise's
// @modelcontextprotocol/sdk Client can connect natively.

// GET /mcp — SSE stream (Streamable HTTP transport handshake)
fastify.get(
  "/mcp",
  { preHandler: validateMcpKey },
  async (request, reply) => {
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
  { preHandler: validateMcpKey },
  async (request) => {
    return handleMcpRequest(request.body);
  }
);

// =============================================================================
// START
// =============================================================================

export async function start() {
  try {
    await fastify.listen({ port: MCP_PORT, host: "0.0.0.0" });
    console.log(`DOMUS MCP server listening on port ${MCP_PORT}`);
    console.log(`Peppermint API: ${process.env.PEPPERMINT_API_URL || "http://localhost:5003"}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}
