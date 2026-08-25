import { paise, type Paise, type RoundingRule } from './types.js';

/**
 * Rounds a Paise amount to a whole number of rupees (paise count divisible by 100n).
 *
 * Supports two rules:
 * - 'HALF_DOWN': Company-specific rule (fractional part <= ₹0.50 rounds DOWN, > ₹0.50 rounds UP).
 * - 'HALF_UP': Standard CGST Act Section 170 rule (fractional part >= ₹0.50 rounds UP).
 *
 * Negative amounts round on magnitude, then the sign is re-applied.
 * E.g., under HALF_DOWN: -₹123.50 -> -₹123, -₹123.60 -> -₹124.
 * Reasoning: This keeps a future credit note exactly symmetrical with the invoice it reverses.
 * This is a deliberate architectural decision, not an accident.
 *
 * @param amount Input amount in Paise
 * @param rule Rounding rule ('HALF_DOWN' or 'HALF_UP')
 * @returns Rounded amount in Paise (always ending in 00 paise)
 */
export function roundToRupee(amount: Paise, rule: RoundingRule): Paise {
  const neg = amount < 0n;
  const abs = neg ? -amount : amount;
  const rem = abs % 100n;
  const base = abs - rem;
  const up = rule === 'HALF_DOWN' ? rem > 50n : rem >= 50n;
  const r = up ? base + 100n : base;
  return paise(neg ? -r : r);
}
