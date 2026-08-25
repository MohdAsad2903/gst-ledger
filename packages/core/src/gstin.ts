import { VALID_STATE_CODES } from './classification.js';
import type { GstinError, ParsedGstin, Result } from './types.js';

const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Validates a 15-character Indian Goods and Services Tax Identification Number (GSTIN).
 *
 * Structure:
 * - Chars 1-2: 2-digit State Code
 * - Chars 3-12: 10-character PAN (5 letters, 4 digits, 1 letter)
 * - Char 13: 1-character entity code (1-9, A-Z)
 * - Char 14: Default character 'Z'
 * - Char 15: 1-character checksum based on base-36 weighted modulo-36 algorithm.
 *
 * Distinguishes:
 * - 'INVALID_LENGTH': String length is not exactly 15 characters
 * - 'INVALID_STATE_CODE': First two digits do not match any Indian state/territory code
 * - 'INVALID_FORMAT': Internal format (PAN structure, 'Z' in 14th position) does not match
 * - 'INVALID_CHECKSUM': Calculated base-36 checksum differs from the 15th character
 *
 * @param gstin Raw GSTIN string
 * @returns Result containing ParsedGstin breakdown on success or GstinError on failure
 */
export function validateGstin(gstin: string): Result<ParsedGstin, GstinError> {
  const trimmed = gstin.trim().toUpperCase();

  if (trimmed.length !== 15) {
    return { ok: false, error: 'INVALID_LENGTH' };
  }

  const stateCode = trimmed.slice(0, 2);
  if (!VALID_STATE_CODES.has(stateCode)) {
    return { ok: false, error: 'INVALID_STATE_CODE' };
  }

  // Standard GSTIN structure: 2 digits + 5 letters + 4 digits + 1 letter + 1 entity char + 'Z' + 1 check char
  const formatRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
  if (!formatRegex.test(trimmed)) {
    return { ok: false, error: 'INVALID_FORMAT' };
  }

  // Compute Base-36 weighted checksum
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const char = trimmed[i]!;
    const codePoint = GSTIN_CHARS.indexOf(char);
    if (codePoint === -1) {
      return { ok: false, error: 'INVALID_FORMAT' };
    }
    const factor = i % 2 === 0 ? 1 : 2;
    const prod = codePoint * factor;
    const quotient = Math.floor(prod / 36);
    const remainder = prod % 36;
    sum += quotient + remainder;
  }

  const checkVal = (36 - (sum % 36)) % 36;
  const expectedCheckChar = GSTIN_CHARS[checkVal]!;

  if (trimmed[14] !== expectedCheckChar) {
    return { ok: false, error: 'INVALID_CHECKSUM' };
  }

  return {
    ok: true,
    value: {
      gstin: trimmed,
      stateCode,
      pan: trimmed.slice(2, 12),
      entityCode: trimmed.slice(12, 13),
      checksum: trimmed[14]!,
    },
  };
}
