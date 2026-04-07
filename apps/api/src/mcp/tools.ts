import { prisma } from "../prisma";
import { Prisma } from "@prisma/client";

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
// HELPERS
// =============================================================================

/**
 * Compose a single human-readable address string from a DomusUnit's address
 * fields. Used so vendor dispatch emails can show a real street address rather
 * than internal property/unit IDs. See REQ-10.
 */
function composeUnitAddress(unit: {
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  propertyDescription?: string | null;
  unitDescription?: string | null;
}): string {
  const street = unit.street?.trim() ?? "";
  const postal = unit.postalCode?.trim() ?? "";
  const city = unit.city?.trim() ?? "";
  let base = "";
  if (street || postal || city) {
    base = `${street}, ${postal} ${city}`
      .replace(/\s+/g, " ")
      .replace(/^,\s*|,\s*$/g, "")
      .trim();
  } else if (unit.propertyDescription?.trim()) {
    base = unit.propertyDescription.trim();
  }
  const unitDesc = unit.unitDescription?.trim();
  return unitDesc ? (base ? `${base} (${unitDesc})` : `(${unitDesc})`) : base;
}

function attachAddress<T extends Parameters<typeof composeUnitAddress>[0]>(
  unit: T
): T & { address: string } {
  return { ...unit, address: composeUnitAddress(unit) };
}

// =============================================================================
// TOOL DEFINITIONS — call Prisma directly (same queries as domus.ts search routes)
// =============================================================================

export const tools: ToolDefinition[] = [
  {
    name: "domus_search_by_email",
    description:
      "Search DOMUS tenant/owner data by email address. Returns matching units with banking info. Each returned unit includes a composed 'address' string (street, postal code, city, unit description) suitable for vendor dispatch.",
    parameters: {
      email: {
        type: "string",
        required: true,
        description: "Email address to search for",
      },
    },
    execute: async (params) => {
      const units = await prisma.domusUnit.findMany({
        where: { OR: [{ email: params.email }, { email2: params.email }] },
        include: { bankingInfo: true },
      });
      return { success: true, units: units.map(attachAddress) };
    },
  },
  {
    name: "domus_search_by_name",
    description:
      "Search DOMUS tenant/owner data by name. Searches across name1, name2, and searchTerm fields (case-insensitive). Each returned unit includes a composed 'address' string suitable for vendor dispatch.",
    parameters: {
      name: {
        type: "string",
        required: true,
        description: "Name to search for",
      },
    },
    execute: async (params) => {
      const units = await prisma.domusUnit.findMany({
        where: {
          OR: [
            { name1: { contains: params.name, mode: "insensitive" } },
            { name2: { contains: params.name, mode: "insensitive" } },
            { searchTerm: { contains: params.name, mode: "insensitive" } },
          ],
        },
        include: { bankingInfo: true },
      });
      return { success: true, units: units.map(attachAddress) };
    },
  },
  {
    name: "domus_search_by_property_unit",
    description:
      "Search DOMUS data by property number and/or unit number. At least one must be provided. Each returned unit includes a composed 'address' string suitable for vendor dispatch.",
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
      const where: Prisma.DomusUnitWhereInput = {};
      if (params.property_number) where.propertyNumber = String(params.property_number);
      if (params.unit_number) where.unitNumber = String(params.unit_number);

      const units = await prisma.domusUnit.findMany({
        where,
        include: { bankingInfo: true },
      });
      return { success: true, units: units.map(attachAddress) };
    },
  },
  {
    name: "domus_search_by_tenant_number",
    description:
      "Search DOMUS data by tenant/owner number (MieterEigentümernummer). Each returned unit includes a composed 'address' string suitable for vendor dispatch.",
    parameters: {
      tenant_number: {
        type: "string",
        required: true,
        description: "Tenant/owner number",
      },
    },
    execute: async (params) => {
      const units = await prisma.domusUnit.findMany({
        where: { tenantOwnerNumber: params.tenant_number },
        include: { bankingInfo: true },
      });
      return { success: true, units: units.map(attachAddress) };
    },
  },
  {
    name: "domus_get_unit_details",
    description:
      "Get full DOMUS unit details including banking info, allocation keys, and scheduled charges. The returned unit includes a composed 'address' string suitable for vendor dispatch.",
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
      const unit = await prisma.domusUnit.findFirst({
        where: {
          propertyNumber: String(params.property_number),
          unitNumber: String(params.unit_number),
        },
        include: {
          bankingInfo: true,
          allocationKeys: { orderBy: { keyIndex: "asc" } },
          scheduledCharges: { orderBy: { chargeIndex: "asc" } },
        },
      });
      if (!unit) throw new Error("Unit not found");
      return { success: true, unit: attachAddress(unit) };
    },
  },
];

export const toolsByName = new Map(tools.map((t) => [t.name, t]));
