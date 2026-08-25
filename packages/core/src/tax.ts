import {
  paise,
  type Paise,
  type RoundingRule,
  type SupplyType,
  type TaxSplit,
  type VarianceSeverity,
} from './types.js';

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
 *   cgst = expectedTaxPaise(taxable, rateBps / 2, rule)
 *   sgst = totalTax - cgst
 *   igst = 0
 *
 * SGST is derived by subtraction so that cgst + sgst === totalTax ALWAYS.
 * If |cgst - sgst| > ₹1 (100 paise), the SPLIT_ASYMMETRY flag is set.
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

  // INTRA supply: split half rate to CGST, derive SGST by subtraction
  const halfRateBps = rateBps / 2n;
  const cgst = expectedTaxPaise(taxable, halfRateBps, rule);
  const sgst = paise(totalTax - cgst);
  const diff = cgst > sgst ? cgst - sgst : sgst - cgst;
  const flags: Array<'SPLIT_ASYMMETRY'> = diff > 100n ? ['SPLIT_ASYMMETRY'] : [];

  return {
    cgst,
    sgst,
    igst: paise(0n),
    flags,
  };
}
