import {
  paise,
  type Paise,
  type RoundingRule,
  type SupplyType,
  type TaxSplit,
  type VarianceSeverity,
} from './types.js';
import { roundToRupee } from './rounding.js';

/**
 * Computes expected GST tax in Paise for a taxable amount and rate in basis points (18% = 1800n).
 *
 * Implements exact integer arithmetic with no floating-point coercion anywhere.
 *
 * For HALF_DOWN (company rule):
 *   N = taxable * rateBps
 *   R = (2 * N + 1_000_000 - 1) / 2_000_000   (exact half rounds DOWN)
 *
 * For HALF_UP (CGST Section 170):
 *   N = taxable * rateBps
 *   R = (2 * N + 1_000_000) / 2_000_000       (exact half rounds UP)
 *
 * Negative taxable amounts are computed on magnitude and the sign is re-applied.
 *
 * @param taxable Taxable amount (amount before GST) in Paise
 * @param rateBps GST tax rate in basis points (e.g. 1800n = 18%, 500n = 5%)
 * @param rule Rounding rule ('HALF_DOWN' or 'HALF_UP')
 * @returns Expected tax in Paise (always ending in 00 paise / whole rupees)
 */
export function expectedTaxPaise(taxable: Paise, rateBps: bigint, rule: RoundingRule): Paise {
  const neg = taxable < 0n;
  const absTaxable = neg ? -taxable : taxable;

  if (absTaxable === 0n || rateBps === 0n) {
    return paise(0n);
  }

  const N = absTaxable * rateBps;
  const R =
    rule === 'HALF_DOWN'
      ? (2n * N + 1_000_000n - 1n) / 2_000_000n
      : (2n * N + 1_000_000n) / 2_000_000n;

  const r = R * 100n;
  return paise(neg ? -r : r);
}

/**
 * Tax at half the given rate, without truncating an odd rateBps.
 *
 * Avoids integer division truncation on odd basis points (e.g. 25 bps / 2n -> 12 bps).
 *
 * @param taxable Taxable amount in Paise
 * @param rateBps Full tax rate in basis points
 * @param rule Rounding rule
 * @returns Half-rate tax in Paise rounded to whole rupee
 */
export function halfRateTaxPaise(taxable: Paise, rateBps: bigint, rule: RoundingRule): Paise {
  const neg = taxable < 0n;
  const abs = neg ? -taxable : taxable;
  if (abs === 0n || rateBps === 0n) return paise(0n);

  const N = abs * rateBps; // full-tax rupee value = N / 1_000_000
  const R =
    rule === 'HALF_DOWN'
      ? (N + 1_000_000n - 1n) / 2_000_000n // = ceil(N / 2e6 - 0.5)
      : (N + 1_000_000n) / 2_000_000n;

  const r = R * 100n;
  return paise(neg ? -r : r);
}

/**
 * Computes tax variance: entered tax minus expected tax.
 *
 * variance = enteredTax - expectedTaxPaise(taxable, rateBps, rule)
 *
 * @param enteredTax The tax amount entered by the user in Paise
 * @param taxable Taxable amount before GST in Paise
 * @param rateBps Tax rate in basis points (e.g. 1800n for 18%)
 * @param rule Rounding rule used for calculation
 * @returns Signed variance in Paise
 */
export function taxVariancePaise(
  enteredTax: Paise,
  taxable: Paise,
  rateBps: bigint,
  rule: RoundingRule,
): Paise {
  const expected = expectedTaxPaise(taxable, rateBps, rule);
  return paise(enteredTax - expected);
}

/**
 * Classifies the severity of a tax variance against configurable thresholds.
 *
 * - 0 -> 'NONE'
 * - |variance| <= infoPaise -> 'INFO' (quiet hint)
 * - |variance| <= warnPaise -> 'WARN' (visible warning)
 * - |variance| > warnPaise -> 'CONFIRM' (requires explicit confirmation)
 *
 * @param variance Computed variance in Paise
 * @param thresholds Configurable threshold values in Paise
 * @returns VarianceSeverity ('NONE' | 'INFO' | 'WARN' | 'CONFIRM')
 */
export function varianceSeverity(
  variance: Paise,
  thresholds: { infoPaise: bigint; warnPaise: bigint },
): VarianceSeverity {
  const absV = variance < 0n ? -variance : variance;
  if (absV === 0n) {
    return 'NONE';
  }
  if (absV <= thresholds.infoPaise) {
    return 'INFO';
  }
  if (absV <= thresholds.warnPaise) {
    return 'WARN';
  }
  return 'CONFIRM';
}

/**
 * Splits tax between CGST, SGST, and IGST based on supply type.
 *
 * For INTER (Inter-State):
 *   igst = totalTax, cgst = 0, sgst = 0
 *
 * For INTRA (Intra-State):
 *   cgst = halfRateTaxPaise(taxable, rateBps, rule)
 *   sgst = totalTax - cgst
 *   If sgst < 0 or |cgst - sgst| > ₹1 (100 paise), fall back to halving entered tax:
 *     cgst = roundToRupee(totalTax / 2, rule)
 *     sgst = totalTax - cgst
 *     flag = 'SPLIT_FROM_ENTERED'
 *
 * SGST is derived by subtraction so that cgst + sgst === totalTax ALWAYS.
 *
 * @param params Split parameters (supplyType, totalTax, taxable, rateBps, rule)
 * @returns TaxSplit object containing cgst, sgst, igst, and flags
 */
export function splitTax(params: {
  supplyType: SupplyType;
  totalTax: Paise;
  taxable: Paise;
  rateBps: bigint;
  rule: RoundingRule;
}): TaxSplit {
  const { supplyType, totalTax, taxable, rateBps, rule } = params;

  if (supplyType === 'INTER') {
    return {
      cgst: paise(0n),
      sgst: paise(0n),
      igst: totalTax,
      flags: [],
    };
  }

  // INTRA supply
  let cgst = halfRateTaxPaise(taxable, rateBps, rule);
  let sgst = paise(totalTax - cgst);

  const flags: Array<'SPLIT_ASYMMETRY' | 'SPLIT_FROM_ENTERED'> = [];

  const diff = cgst > sgst ? cgst - sgst : sgst - cgst;
  if (sgst < 0n || diff > 100n) {
    cgst = roundToRupee(paise(totalTax / 2n), rule);
    sgst = paise(totalTax - cgst);
    flags.push('SPLIT_FROM_ENTERED');
  }

  return {
    cgst,
    sgst,
    igst: paise(0n),
    flags,
  };
}
