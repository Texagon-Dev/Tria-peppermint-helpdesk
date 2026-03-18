import type { ToolParameter } from "./tools";
import { tools, toolsByName } from "./tools";

// =============================================================================
// MCP PROTOCOL HELPERS
// =============================================================================

export function toInputSchema(params: Record<string, ToolParameter>) {
  const properties: Record<string, any> = {};
  const required: string[] = [];
  for (const [name, def] of Object.entries(params)) {
    properties[name] = { type: def.type, description: def.description };
    if (def.required) required.push(name);
  }
  return { type: "object" as const, properties, required };
}

export function mcpError(
  id: string | null,
  code: number,
  message: string
) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function dateReplacer(_key: string, value: any) {
  if (value instanceof Date) return value.toISOString();
  return value;
}

// =============================================================================
// JSON-RPC 2.0 HANDLER
// =============================================================================

export async function handleMcpRequest(body: any) {
  const method = body?.method;
  const params = body?.params || {};
  const requestId = body?.id ?? null;

  // --- initialize ---
  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: requestId,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "peppermint-domus-mcp", version: "1.0.0" },
      },
    };
  }

  // --- tools/list ---
  if (method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id: requestId,
      result: {
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: toInputSchema(t.parameters),
        })),
      },
    };
  }

  // --- tools/call ---
  if (method === "tools/call") {
    const toolName = params.name as string;
    const args = (params.arguments || {}) as Record<string, string>;

    if (!toolName || !toolsByName.has(toolName)) {
      return mcpError(
        requestId,
        -32601,
        `Tool not found: ${toolName}. Available: ${tools.map((t) => t.name).join(", ")}`
      );
    }

    const tool = toolsByName.get(toolName)!;
    try {
      const result = await tool.execute(args);
      return {
        jsonrpc: "2.0",
        id: requestId,
        result: {
          content: [
            { type: "text", text: JSON.stringify(result, dateReplacer) },
          ],
        },
      };
    } catch (err: any) {
      return mcpError(
        requestId,
        -32000,
        `Tool execution failed: ${err.message}`
      );
    }
  }

  // --- unknown method ---
  return mcpError(
    requestId,
    -32601,
    `Method not found: ${method}. Supported: initialize, tools/list, tools/call`
  );
}
