import type { ClassifyError, GstinError, Result, SupplyType } from './types.js';

/**
 * Complete official set of Indian GST 2-digit state and territory codes.
 * Covers 01 to 38, plus 96 (Foreign) and 97 (Other Territory).
 */
export const VALID_STATE_CODES: ReadonlySet<string> = new Set([
  '01',
  '02',
  '03',
  '04',
  '05',
  '06',
  '07',
  '08',
  '09',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '17',
  '18',
  '19',
  '20',
  '21',
  '22',
  '23',
  '24',
  '25',
  '26',
  '27',
  '28',
  '29',
  '30',
  '31',
  '32',
  '33',
  '34',
  '35',
  '36',
  '37',
  '38',
  '96',
  '97',
]);

/**
 * Extracts and validates the 2-digit state code from the first two characters of a GSTIN.
 *
 * @param gstin Full or partial GSTIN string
 * @returns Result containing 2-digit state code on success or GstinError on failure
 */
export function stateCodeFromGstin(gstin: string): Result<string, GstinError> {
  const trimmed = gstin.trim().toUpperCase();
  if (trimmed.length < 2) {
    return { ok: false, error: 'INVALID_LENGTH' };
  }
  const code = trimmed.slice(0, 2);
  if (!VALID_STATE_CODES.has(code)) {
    return { ok: false, error: 'INVALID_STATE_CODE' };
  }
  return { ok: true, value: code };
}

/**
 * Classifies supply as INTRA (Intra-State -> CGST+SGST) or INTER (Inter-State -> IGST).
 *
 * The company's own state is never hard-coded; ourStateCode must be explicitly passed.
 *
 * @param params Object containing counterpartyStateCode and ourStateCode
 * @returns Result containing SupplyType ('INTRA' | 'INTER') or ClassifyError
 */
export function classifySupply(params: {
  counterpartyStateCode: string;
  ourStateCode: string;
}): Result<SupplyType, ClassifyError> {
  const { counterpartyStateCode, ourStateCode } = params;

  if (!VALID_STATE_CODES.has(counterpartyStateCode) || !VALID_STATE_CODES.has(ourStateCode)) {
    return { ok: false, error: 'INVALID_STATE_CODE' };
  }

  if (counterpartyStateCode === ourStateCode) {
    return { ok: true, value: 'INTRA' };
  }

  return { ok: true, value: 'INTER' };
}

/**
 * Resolves the authoritative state code from optional GSTIN and manual selection.
 *
 * Rules:
 * 1. Neither present -> STATE_UNKNOWN
 * 2. GSTIN present, no manual selection -> state code from GSTIN
 * 3. No GSTIN, manual selection present -> manual selection
 * 4. Both present and in agreement -> that state code
 * 5. Both present and disagree -> GSTIN_STATE_MISMATCH (never silently pick one)
 *
 * @param params Optional gstin and optional selectedStateCode
 * @returns Result containing resolved 2-digit state code or ClassifyError
 */
export function resolveStateCode(params: {
  gstin?: string;
  selectedStateCode?: string;
}): Result<string, ClassifyError> {
  const { gstin, selectedStateCode } = params;

  const hasGstin = Boolean(gstin && gstin.trim().length > 0);
  const hasSelection = Boolean(selectedStateCode && selectedStateCode.trim().length > 0);

  if (!hasGstin && !hasSelection) {
    return { ok: false, error: 'STATE_UNKNOWN' };
  }

  if (hasGstin && !hasSelection) {
    const fromGstin = stateCodeFromGstin(gstin!);
    if (!fromGstin.ok) {
      return { ok: false, error: 'INVALID_STATE_CODE' };
    }
    return { ok: true, value: fromGstin.value };
  }

  if (!hasGstin && hasSelection) {
    const sel = selectedStateCode!.trim();
    if (!VALID_STATE_CODES.has(sel)) {
      return { ok: false, error: 'INVALID_STATE_CODE' };
    }
    return { ok: true, value: sel };
  }

  // Both present
  const fromGstin = stateCodeFromGstin(gstin!);
  if (!fromGstin.ok) {
    return { ok: false, error: 'INVALID_STATE_CODE' };
  }

  const sel = selectedStateCode!.trim();
  if (!VALID_STATE_CODES.has(sel)) {
    return { ok: false, error: 'INVALID_STATE_CODE' };
  }

  if (fromGstin.value !== sel) {
    return { ok: false, error: 'GSTIN_STATE_MISMATCH' };
  }

  return { ok: true, value: sel };
}
