import { paise, type AmountError, type Paise, type Result } from './types.js';

/**
 * Parses user input amount string into integer Paise.
 *
 * Accepts formats:
 * - "182644" -> 18264400n
 * - "1,82,644" -> 18264400n
 * - "1,82,644.00" -> 18264400n
 * - "₹1,82,644" -> 18264400n
 * - "₹ 1,82,644.50" -> 18264450n
 * - " 182644 " -> 18264400n
 * - "0.01" -> 1n
 * - "0" -> 0n
 * - "1234.5" -> 123450n
 *
 * Rejects:
 * - "1.234" -> TOO_MANY_DECIMALS
 * - "1.2.3" -> MALFORMED
 * - "abc" -> NOT_A_NUMBER
 * - "" -> EMPTY
 * - "-100" -> NEGATIVE_NOT_ALLOWED
 * - "1e5" -> MALFORMED
 *
 * Never uses parseFloat, Number(), or parseInt on monetary numbers.
 *
 * @param input Raw user string input
 * @returns Result containing Paise on success or AmountError on failure
 */
export function parseAmountToPaise(input: string): Result<Paise, AmountError> {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: 'EMPTY' };
  }

  // Check for negative amounts
  if (trimmed.startsWith('-') || trimmed.includes('-')) {
    return { ok: false, error: 'NEGATIVE_NOT_ALLOWED' };
  }

  // Strip leading currency symbol '₹'
  let clean = trimmed;
  if (clean.startsWith('₹')) {
    clean = clean.slice(1).trim();
  }

  if (clean.length === 0) {
    return { ok: false, error: 'EMPTY' };
  }

  // Scientific notation and exponential forms are malformed
  if (/[eE]/.test(clean)) {
    return { ok: false, error: 'MALFORMED' };
  }

  // Check for alphabetic characters
  if (/[a-zA-Z]/.test(clean)) {
    return { ok: false, error: 'NOT_A_NUMBER' };
  }

  // Check for invalid characters (only digits, commas, and a single dot are allowed)
  if (!/^[0-9,.]+$/.test(clean)) {
    return { ok: false, error: 'NOT_A_NUMBER' };
  }

  const parts = clean.split('.');
  if (parts.length > 2) {
    return { ok: false, error: 'MALFORMED' };
  }

  const rawInteger = parts[0] ?? '';
  const rawFraction = parts[1];

  // Remove commas from integer part
  const integerDigits = rawInteger.replace(/,/g, '');
  if (integerDigits.length === 0 && rawFraction === undefined) {
    return { ok: false, error: 'EMPTY' };
  }

  if (!/^\d*$/.test(integerDigits)) {
    return { ok: false, error: 'MALFORMED' };
  }

  const intPart = integerDigits.length === 0 ? '0' : integerDigits;

  let fracPart = '00';
  if (rawFraction !== undefined) {
    // Commas are not allowed in decimal part
    if (rawFraction.includes(',')) {
      return { ok: false, error: 'MALFORMED' };
    }
    if (!/^\d*$/.test(rawFraction)) {
      return { ok: false, error: 'NOT_A_NUMBER' };
    }
    if (rawFraction.length > 2) {
      return { ok: false, error: 'TOO_MANY_DECIMALS' };
    }
    if (rawFraction.length === 2) {
      fracPart = rawFraction;
    } else if (rawFraction.length === 1) {
      fracPart = rawFraction + '0';
    } else {
      fracPart = '00';
    }
  }

  try {
    const combinedString = intPart + fracPart;
    const value = BigInt(combinedString);
    return { ok: true, value: paise(value) };
  } catch {
    return { ok: false, error: 'MALFORMED' };
  }
}

/**
 * Options for formatting Paise amounts.
 */
export interface FormatPaiseOptions {
  /** Whether to prefix with the Indian Rupee symbol '₹'. Default: false */
  symbol?: boolean;
  /** Number of decimal places to output (0 or 2). Default: 2 */
  decimals?: 0 | 2;
}

/**
 * Formats a Paise amount into an Indian number grouped string.
 * Uses 2-2-3 grouping from the right (e.g. 1,82,644.00, 13,30,677.00, 87,23,327.00).
 * Never uses Western 3-3 grouping (1,234,567.00).
 * Never uses Intl.NumberFormat to avoid platform and locale variance.
 *
 * @param amount Branded Paise value
 * @param opts Formatting options (symbol, decimals)
 * @returns Deterministically formatted Indian currency string
 */
export function formatPaise(amount: Paise, opts?: FormatPaiseOptions): string {
  const decimals = opts?.decimals ?? 2;
  const showSymbol = opts?.symbol ?? false;

  const isNeg = amount < 0n;
  const absAmount = isNeg ? -amount : amount;

  const rupees = absAmount / 100n;
  const paiseRemainder = absAmount % 100n;

  const rupeesStr = rupees.toString();
  let groupedRupees = '';

  if (rupeesStr.length <= 3) {
    groupedRupees = rupeesStr;
  } else {
    const last3 = rupeesStr.slice(-3);
    const rest = rupeesStr.slice(0, -3);
    const formattedRest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    groupedRupees = formattedRest + ',' + last3;
  }

  let formatted = groupedRupees;
  if (decimals === 2) {
    const fracStr = paiseRemainder.toString().padStart(2, '0');
    formatted += '.' + fracStr;
  }

  const prefix = isNeg ? (showSymbol ? '-₹' : '-') : showSymbol ? '₹' : '';
  return prefix + formatted;
}
