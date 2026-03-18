import axios from "axios";

const PEPPERMINT_API_URL =
  process.env.PEPPERMINT_API_URL || "http://localhost:5003";
const PEPPERMINT_API_KEY = process.env.PEPPERMINT_API_KEY || "";

// =============================================================================
// TYPES
// =============================================================================

export interface ToolParameter {
  type: string;
  required: boolean;
  description: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  execute: (params: Record<string, string>) => Promise<any>;
}

// =============================================================================
// PEPPERMINT API PROXY
// =============================================================================

async function callPeppermint(path: string): Promise<any> {
  const url = `${PEPPERMINT_API_URL}${path}`;
  const res = await axios.get(url, {
    headers: { "X-API-Key": PEPPERMINT_API_KEY },
  });
  return res.data;
}

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const tools: ToolDefinition[] = [
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
      if (!params.property_number && !params.unit_number) {
        throw new Error(
          "At least one of property_number or unit_number is required."
        );
      }
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

export const toolsByName = new Map(tools.map((t) => [t.name, t]));
