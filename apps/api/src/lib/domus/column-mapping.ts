/**
 * DOMUS1000 German → English Column Mapping
 *
 * Ported from triaApp-Backend/app/features/integrations/domus/column_mapping.py
 * Maps German CSV column headers to camelCase Prisma field names.
 */

// =============================================================================
// CORE COLUMN MAPPING (~50 fields)
// =============================================================================

export const CORE_COLUMN_MAP: Record<string, string> = {
  "Suchbegriff (LAST NAME)": "searchTerm",
  "Anschrift": "address",
  "Straße": "street",
  "Postfach": "poBox",
  "PLZ": "postalCode",
  "Objektnummer": "propertyNumber",
  "Objektbezeichnung": "propertyDescription",
  "Ort": "city",
  "Land": "country",
  "Anrede1": "salutation1",
  "Name1": "name1",
  "Anrede2": "salutation2",
  "Name2": "name2",
  "Name3": "name3",
  "Name4": "name4",
  "Tel_Privat": "phonePrivate",
  "Tel_Privat2": "phonePrivate2",
  "Tel_Firma": "phoneBusiness",
  "Tel_Firma2": "phoneBusiness2",
  "Fax": "fax",
  "Mobil": "mobile",
  "Mobil2": "mobile2",
  "Email": "email",
  "Email2": "email2",
  "Homepage": "homepage",
  "Branche": "sector",
  "Einheitsbezeichnung": "unitDescription",
  "Ausstattung": "equipment",
  "Steuernummer": "taxNumber",
  "Freistellungsdatum": "taxExemptionDate",
  "Einheitennummer": "unitNumber",
  "Adressnummer": "addressNumber",
  "MieterEigentümernummer": "tenantOwnerNumber",
  "D130Nr": "d130Number",
  "Einzugsdatum": "moveInDate",
  "Auszugsdatum": "moveOutDate",
  "Zusatz1": "additional1",
  "Zusatz2": "additional2",
  "Zusatz3": "additional3",
  "Lastschrift": "directDebitActive",
  "Lastschrift ab": "directDebitFrom",
  "Lastschrift bis": "directDebitUntil",
  "Lastschrift Tag": "directDebitDay",
  "MandatReferenz": "mandateReference",
  "GueltigVon": "mandateValidFrom",
  "GueltigBis": "mandateValidUntil",
  "FormDatum": "formDate",
  "Auslandsadresse Aktiv": "foreignAddressActive",
  "Adresszeile1": "addressLine1",
  "Adresszeile2": "addressLine2",
  "Adresszeile3": "addressLine3",
  "Adresszeile4": "addressLine4",
  "Bruttogesamtmiete": "totalGrossRent",
};

// =============================================================================
// BANKING COLUMN MAPPING (~22 fields)
// =============================================================================

export const BANKING_COLUMN_MAP: Record<string, string> = {
  "Bank": "bankName",
  "BLZ": "bankCode",
  "Konto": "accountNumber",
  "BIC": "bic",
  "IBAN": "iban",
  "Inhaber": "accountHolder",
  "Objektbank": "propertyBank",
  "Objektbank BLZ": "propertyBankCode",
  "Objektbank Kontonummer": "propertyBankAccount",
  "Objektbank Inhaber": "propertyBankHolder",
  "Objektbank BIC": "propertyBankBic",
  "Objektbank IBAN": "propertyBankIban",
  "ObjektbankGläubigerBezeichnung": "propertyBankCreditorName",
  "ObjektbankGläubigerID": "propertyBankCreditorId",
  "MieterLEVBankBank": "tenantLevBank",
  "MieterLEVBankBLZ": "tenantLevBankCode",
  "MieterLEVBankKontonummer": "tenantLevBankAccount",
  "MieterLEVBankKontoinhaber": "tenantLevBankHolder",
  "MieterLEVBankBIC": "tenantLevBankBic",
  "MieterLEVBankIBAN": "tenantLevBankIban",
  "MieterLEVBankGläubigerBezeichnung": "tenantLevCreditorName",
  "MieterLEVBankGläubigerID": "tenantLevCreditorId",
};

// =============================================================================
// ALLOCATION KEY FIELDS (SCHL_001 to SCHL_020, 9 fields each)
// =============================================================================

export const ALLOCATION_KEY_FIELDS: Record<string, string> = {
  "Schlüsselbezeichnung": "keyDescription",
  "Schlüssel_Gesamtwert": "totalValue",
  "Schlüssel_Art": "keyType",
  "Schlüssel_Erläuterung": "explanation",
  "Schlüssel_Wert": "keyValue",
  "Zählerstand_neu": "meterReadingNew",
  "Zählerstand_Alt": "meterReadingOld",
  "Datum": "readingDate",
  "Schlüssel_WertVariabel": "variableValue",
};

export const ALLOCATION_KEY_PATTERN = /^SCHL_(\d{3})_(.+)$/;

// =============================================================================
// SCHEDULED CHARGE FIELDS (SOLL_001 to SOLL_020, 7 fields each)
// =============================================================================

export const SCHEDULED_CHARGE_FIELDS: Record<string, string> = {
  "D015Nr": "d015Number",
  "D905Text": "chargeText",
  "D905Zahlungsweise": "paymentMethod",
  "D905Monat": "month",
  "D210NR": "d210Number",
  "D906Art": "chargeType",
  "D062Soll": "amount",
};

export const SCHEDULED_CHARGE_PATTERN = /^SOLL_(\d{3})_(.+)$/;

// =============================================================================
// FIELD TYPE SETS
// =============================================================================

export const DATE_FIELDS = new Set([
  "taxExemptionDate", "moveInDate", "moveOutDate",
  "directDebitFrom", "directDebitUntil",
  "mandateValidFrom", "mandateValidUntil", "formDate",
  "readingDate",
]);

export const BOOLEAN_FIELDS = new Set([
  "directDebitActive", "foreignAddressActive",
]);

export const DECIMAL_FIELDS = new Set([
  "totalGrossRent", "totalValue", "keyValue",
  "meterReadingNew", "meterReadingOld", "variableValue", "amount",
]);

export const INTEGER_FIELDS = new Set([
  "directDebitDay",
]);

// =============================================================================
// GERMAN DATA PARSERS
// =============================================================================

export function parseGermanDate(value: string): Date | null {
  if (!value || !value.trim()) return null;
  const parts = value.trim().split(".");
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      return new Date(year, month - 1, day);
    }
  }
  return null;
}

export function parseGermanBoolean(value: string): boolean | null {
  if (!value || !value.trim()) return null;
  const lower = value.trim().toLowerCase();
  if (["wahr", "ja", "true", "1", "yes"].includes(lower)) return true;
  if (["falsch", "nein", "false", "0", "no"].includes(lower)) return false;
  return null;
}

export function parseGermanDecimal(value: string): number | null {
  if (!value || !value.trim()) return null;
  let cleaned = value.trim().replace("€", "").replace(/"/g, "").trim();
  if (cleaned.includes(",")) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  }
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

export function parseInteger(value: string): number | null {
  if (!value || !value.trim()) return null;
  let cleaned = value.trim();
  if (cleaned.includes(",")) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  }
  const num = parseInt(String(parseFloat(cleaned)), 10);
  return isNaN(num) ? null : num;
}

export function convertValue(fieldName: string, value: string): any {
  if (!value || !value.trim()) return null;
  if (DATE_FIELDS.has(fieldName)) return parseGermanDate(value);
  if (BOOLEAN_FIELDS.has(fieldName)) return parseGermanBoolean(value);
  if (DECIMAL_FIELDS.has(fieldName)) return parseGermanDecimal(value);
  if (INTEGER_FIELDS.has(fieldName)) return parseInteger(value);
  return value.trim();
}
