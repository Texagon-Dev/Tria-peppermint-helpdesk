import {
  CORE_COLUMN_MAP,
  BANKING_COLUMN_MAP,
  ALLOCATION_KEY_FIELDS,
  SCHEDULED_CHARGE_FIELDS,
  ALLOCATION_KEY_PATTERN,
  SCHEDULED_CHARGE_PATTERN,
  convertValue,
} from "./column-mapping";

export function parseCoreFields(row: Record<string, string>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [germanCol, englishField] of Object.entries(CORE_COLUMN_MAP)) {
    if (germanCol in row) {
      result[englishField] = convertValue(englishField, row[germanCol]);
    }
  }
  return result;
}

export function parseBankingFields(row: Record<string, string>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [germanCol, englishField] of Object.entries(BANKING_COLUMN_MAP)) {
    if (germanCol in row) {
      result[englishField] = convertValue(englishField, row[germanCol]);
    }
  }
  return result;
}

export function parseAllocationKeys(row: Record<string, string>): Record<string, any>[] {
  const keysByIndex: Record<number, Record<string, any>> = {};

  for (const [colName, value] of Object.entries(row)) {
    const match = ALLOCATION_KEY_PATTERN.exec(colName);
    if (match) {
      const keyIndex = parseInt(match[1], 10);
      const fieldSuffix = match[2];
      const englishField = ALLOCATION_KEY_FIELDS[fieldSuffix];
      if (englishField) {
        if (!keysByIndex[keyIndex]) {
          keysByIndex[keyIndex] = { keyIndex };
        }
        keysByIndex[keyIndex][englishField] = convertValue(englishField, value);
      }
    }
  }

  return Object.keys(keysByIndex)
    .map(Number)
    .sort((a, b) => a - b)
    .map((idx) => keysByIndex[idx])
    .filter((keyData) =>
      Object.entries(keyData).some(
        ([k, v]) => k !== "keyIndex" && v !== null && v !== ""
      )
    );
}

export function parseScheduledCharges(row: Record<string, string>): Record<string, any>[] {
  const chargesByIndex: Record<number, Record<string, any>> = {};

  for (const [colName, value] of Object.entries(row)) {
    const match = SCHEDULED_CHARGE_PATTERN.exec(colName);
    if (match) {
      const chargeIndex = parseInt(match[1], 10);
      const fieldSuffix = match[2];
      const englishField = SCHEDULED_CHARGE_FIELDS[fieldSuffix];
      if (englishField) {
        if (!chargesByIndex[chargeIndex]) {
          chargesByIndex[chargeIndex] = { chargeIndex };
        }
        chargesByIndex[chargeIndex][englishField] = convertValue(englishField, value);
      }
    }
  }

  return Object.keys(chargesByIndex)
    .map(Number)
    .sort((a, b) => a - b)
    .map((idx) => chargesByIndex[idx])
    .filter((chargeData) =>
      Object.entries(chargeData).some(
        ([k, v]) => k !== "chargeIndex" && v !== null && v !== ""
      )
    );
}

export function validateRow(row: Record<string, string>): { valid: boolean; error?: string } {
  const propertyNumber = (row["Objektnummer"] || "").trim();
  const unitNumber = (row["Einheitennummer"] || "").trim();
  if (!propertyNumber || !unitNumber) {
    return { valid: false, error: "Missing required Objektnummer or Einheitennummer" };
  }
  return { valid: true };
}
