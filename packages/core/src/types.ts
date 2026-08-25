/**
 * @gst/core Types
 *
 * Defines the nominal Paise money type, discriminated Result type,
 * rounding rules, supply classification, and validation interfaces.
 */

/**
 * Branded nominal money type representing an integer count of paise.
 * Money is NEVER represented as a floating point number.
 */
export type Paise = bigint & { readonly __brand: unique symbol };

/**
 * Constructor helper for branded Paise values.
 *
 * @param n Integer count of paise as a bigint
 * @returns Nominal Paise branded type
 */
export const paise = (n: bigint): Paise => n as Paise;

/**
 * Discriminated result type for returning explicit values or error codes
 * without throwing exceptions on user input.
 */
export type Result<T, E> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

/**
 * Rounding rules for GST calculation:
 * - 'HALF_DOWN': Company-specific rule where exact .5 rounds down.
 * - 'HALF_UP': Standard CGST Act Section 170 rule where exact .5 rounds up.
 */
export type RoundingRule = 'HALF_DOWN' | 'HALF_UP';

/**
 * Documented default rounding rule used by A.M Machine Tool and Dies.
 */
export const COMPANY_ROUNDING_RULE: RoundingRule = 'HALF_DOWN';

/**
 * Supply type classification:
 * - 'INTRA': Intra-state supply (CGST + SGST)
 * - 'INTER': Inter-state supply (IGST)
 */
export type SupplyType = 'INTRA' | 'INTER';

/**
 * Variance severity levels for discrepancies between entered and expected tax.
 */
export type VarianceSeverity = 'NONE' | 'INFO' | 'WARN' | 'CONFIRM';

/**
 * Error codes for parsing string amount inputs.
 */
export type AmountError =
  'EMPTY' | 'NOT_A_NUMBER' | 'MALFORMED' | 'TOO_MANY_DECIMALS' | 'NEGATIVE_NOT_ALLOWED';

/**
 * Error codes for GSTIN parsing and validation.
 */
export type GstinError =
  'INVALID_LENGTH' | 'INVALID_FORMAT' | 'INVALID_STATE_CODE' | 'INVALID_CHECKSUM';

/**
 * Error codes for supply type and state code classification.
 */
export type ClassifyError = 'GSTIN_STATE_MISMATCH' | 'STATE_UNKNOWN' | 'INVALID_STATE_CODE';

/**
 * Structured parsed GSTIN component breakdown.
 */
export interface ParsedGstin {
  readonly gstin: string;
  readonly stateCode: string;
  readonly pan: string;
  readonly entityCode: string;
  readonly checksum: string;
}

/**
 * Result of splitting tax between CGST, SGST, and IGST.
 */
export interface TaxSplit {
  readonly cgst: Paise;
  readonly sgst: Paise;
  readonly igst: Paise;
  readonly flags: Array<'SPLIT_ASYMMETRY'>;
}

/**
 * Structured validation issue returned by bill amount validation.
 */
export interface ValidationIssue {
  readonly code: string;
  readonly severity: 'BLOCK' | 'CONFIRM' | 'WARN' | 'INFO';
  readonly field: 'total' | 'tax' | 'rate' | 'general';
  readonly message: string;
}
