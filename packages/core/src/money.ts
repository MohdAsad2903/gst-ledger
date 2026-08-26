import { paise, type AmountError, type Paise, type Result, type RoundingRule } from './types.js';
import { roundToRupee } from './rounding.js';

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
 * - "0." -> 0n (trailing dot accepted)
 * - ".5" -> 50n (leading dot accepted)
 * - "1234.5" -> 123450n
 *
 * Rejects:
 * - "." -> MALFORMED
 * - "₹." -> MALFORMED
 * - "1-2" -> MALFORMED
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
export function parseAmountToPaise(
  input: string,
  options?: { allowNegative?: boolean },
): Result<Paise, AmountError> {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: 'EMPTY' };
  }

  const allowNegative = options?.allowNegative ?? false;
  const isNegative =
    trimmed.startsWith('-') ||
    trimmed.startsWith('₹-') ||
    trimmed.startsWith('₹ -');

  if (isNegative && !allowNegative) {
    return { ok: false, error: 'NEGATIVE_NOT_ALLOWED' };
  }

  // Check for misplaced hyphens
  if (trimmed.includes('-')) {
    if (!isNegative) {
      return { ok: false, error: 'MALFORMED' };
    }
    // If it has multiple hyphens
    if (trimmed.slice(1).includes('-')) {
      return { ok: false, error: 'MALFORMED' };
    }
  }

  // Strip leading currency symbol '₹'
  let clean = trimmed;
  if (clean.startsWith('₹') || clean.startsWith('-₹') || clean.startsWith('₹-')) {
    clean = clean.replace(/^[₹\s-]+/, '').trim();
  } else if (clean.startsWith('-')) {
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

  // Bare "." or "₹." with no digits in integer or fraction is MALFORMED
  if (integerDigits.length === 0 && (rawFraction === undefined || rawFraction.length === 0)) {
    return { ok: false, error: 'MALFORMED' };
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
    const rawVal = BigInt(combinedString);
    const value = isNegative ? -rawVal : rawVal;
    return { ok: true, value: paise(value) };
  } catch {
    return { ok: false, error: 'MALFORMED' };
  }
}

/**
 * Serializes a Paise amount to a plain decimal string suitable for IPC transport.
 *
 * Format: sign preserved, always exactly two decimal places, no commas, no currency symbol.
 * E.g.: paise(11995100n) -> "119951.00", paise(-100n) -> "-1.00", paise(0n) -> "0.00".
 *
 * @param amount Branded Paise value
 * @returns Plain decimal string
 */
export function paiseToDecimalString(amount: Paise): string {
  const isNeg = amount < 0n;
  const absAmount = isNeg ? -amount : amount;
  const rupees = absAmount / 100n;
  const paiseRemainder = absAmount % 100n;
  const fracStr = paiseRemainder.toString().padStart(2, '0');
  const sign = isNeg ? '-' : '';
  return `${sign}${rupees.toString()}.${fracStr}`;
}

/**
 * Parses a plain decimal string (from IPC transport) into integer Paise.
 * Strict inverse of paiseToDecimalString.
 *
 * @param str Plain decimal string (e.g. "119951.00", "-1.00", "0.00")
 * @returns Result with Paise or AmountError
 */
export function decimalStringToPaise(str: string): Result<Paise, AmountError> {
  return parseAmountToPaise(str, { allowNegative: true });
}

/**
 * Options for formatting Paise amounts.
 */
export interface FormatPaiseOptions {
  /** Whether to prefix with the Indian Rupee symbol '₹'. Default: false */
  symbol?: boolean;
  /** Number of decimal places to output (0 or 2). Default: 2 */
  decimals?: 0 | 2;
  /** Rounding rule to apply when decimals is 0. Default: 'HALF_UP' */
  roundingRule?: RoundingRule;
}

/**
 * Formats a Paise amount into an Indian number grouped string.
 * Uses 2-2-3 grouping from the right (e.g. 1,82,644.00, 13,30,677.00, 87,23,327.00).
 * Never uses Western 3-3 grouping (1,234,567.00).
 * Never uses Intl.NumberFormat to avoid platform and locale variance.
 *
 * When decimals is 0, rounds to the nearest whole rupee before dropping decimal places.
 * Note: Display rounding is a presentation concern separate from tax calculation rounding,
 * and defaults to 'HALF_UP'.
 *
 * @param amount Branded Paise value
 * @param opts Formatting options (symbol, decimals, roundingRule)
 * @returns Deterministically formatted Indian currency string
 */
export function formatPaise(amount: Paise, opts?: FormatPaiseOptions): string {
  const decimals = opts?.decimals ?? 2;
  const showSymbol = opts?.symbol ?? false;
  const rule = opts?.roundingRule ?? 'HALF_UP';

  const effectiveAmount = decimals === 0 ? roundToRupee(amount, rule) : amount;

  const isNeg = effectiveAmount < 0n;
  const absAmount = isNeg ? -effectiveAmount : effectiveAmount;

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
