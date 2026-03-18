import Fastify from "fastify";
import axios from "axios";

// =============================================================================
// CONFIG
// =============================================================================

const MCP_PORT = parseInt(process.env.MCP_PORT || "5004", 10);
const MCP_API_KEY = process.env.MCP_API_KEY || "";
const PEPPERMINT_API_URL =
  process.env.PEPPERMINT_API_URL || "http://localhost:5003";
const PEPPERMINT_API_KEY = process.env.PEPPERMINT_API_KEY || "";

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

interface ToolParameter {
  type: string;
  required: boolean;
  description: string;
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  execute: (params: Record<string, string>) => Promise<any>;
}

async function callPeppermint(path: string): Promise<any> {
  const url = `${PEPPERMINT_API_URL}${path}`;
  const res = await axios.get(url, {
    headers: { "X-API-Key": PEPPERMINT_API_KEY },
  });
  return res.data;
}

const tools: ToolDefinition[] = [
  {
    name: "domus_search_by_email",
    description:
      "Search DOMUS tenant/owner data by email address. Returns matching units with banking info.",
    parameters: {
      email: {
        type: "string",
        required: true,
        description: "Email address to search for",
      },
    },
    execute: async (params) => {
      return callPeppermint(
        `/api/v1/domus/search/email?email=${encodeURIComponent(params.email)}`
      );
    },
  },
  {
    name: "domus_search_by_name",
    description:
      "Search DOMUS tenant/owner data by name. Searches across name1, name2, and searchTerm fields (case-insensitive).",
    parameters: {
      name: {
        type: "string",
        required: true,
        description: "Name to search for",
      },
    },
    execute: async (params) => {
      return callPeppermint(
        `/api/v1/domus/search/name?name=${encodeURIComponent(params.name)}`
      );
    },
  },
  {
    name: "domus_search_by_property_unit",
    description:
      "Search DOMUS data by property number and/or unit number. At least one must be provided.",
    parameters: {
      property_number: {
        type: "string",
        required: false,
        description: "Property number (Objektnummer)",
      },
      unit_number: {
        type: "string",
        required: false,
        description: "Unit number (Einheitennummer)",
      },
    },
    execute: async (params) => {
      const queryParts: string[] = [];
      if (params.property_number)
        queryParts.push(
          `property_number=${encodeURIComponent(params.property_number)}`
        );
      if (params.unit_number)
        queryParts.push(
          `unit_number=${encodeURIComponent(params.unit_number)}`
        );
      return callPeppermint(
        `/api/v1/domus/search/property-unit?${queryParts.join("&")}`
      );
    },
  },
  {
    name: "domus_search_by_tenant_number",
    description:
      "Search DOMUS data by tenant/owner number (MieterEigentümernummer).",
    parameters: {
      tenant_number: {
        type: "string",
        required: true,
        description: "Tenant/owner number",
      },
    },
    execute: async (params) => {
      return callPeppermint(
        `/api/v1/domus/search/tenant-number?tenant_number=${encodeURIComponent(
          params.tenant_number
        )}`
      );
    },
  },
  {
    name: "domus_get_unit_details",
    description:
      "Get full DOMUS unit details including banking info, allocation keys, and scheduled charges.",
    parameters: {
      property_number: {
        type: "string",
        required: true,
        description: "Property number (Objektnummer)",
      },
      unit_number: {
        type: "string",
        required: true,
        description: "Unit number (Einheitennummer)",
      },
    },
    execute: async (params) => {
      return callPeppermint(
        `/api/v1/domus/unit/${encodeURIComponent(
          params.property_number
        )}/${encodeURIComponent(params.unit_number)}`
      );
    },
  },
];

const toolsByName = new Map(tools.map((t) => [t.name, t]));

// =============================================================================
// SERVER
// =============================================================================

const fastify = Fastify({ logger: true });

// MCP auth middleware
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
      return reply.status(500).send({
        success: false,
        error: err.message,
        tool_name,
        platform: "domus",
      });
    }
  }
);

// Start server
async function start() {
  try {
    await fastify.listen({ port: MCP_PORT, host: "0.0.0.0" });
    console.log(`DOMUS MCP server listening on port ${MCP_PORT}`);
    console.log(`Peppermint API: ${PEPPERMINT_API_URL}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
