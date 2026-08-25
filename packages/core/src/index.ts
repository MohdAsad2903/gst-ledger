/**
 * @gst/core
 *
 * Pure domain and calculation engine for GST Ledger (A.M Machine Tool and Dies).
 *
 * Guarantees:
 * - 100% pure and deterministic (no clock, no filesystem, no network, no locale, no random).
 * - Zero runtime dependencies.
 * - Branded Paise type to prevent floating-point contamination.
 * - Integer-only arithmetic using bigint.
 * - Exact company-specific HALF_DOWN and statutory HALF_UP rounding.
 */

// Types & Money constructor
export {
  paise,
  COMPANY_ROUNDING_RULE,
  type Paise,
  type Result,
  type RoundingRule,
  type SupplyType,
  type VarianceSeverity,
  type AmountError,
  type GstinError,
  type ClassifyError,
  type ParsedGstin,
  type TaxSplit,
  type ValidationIssue,
} from './types.js';

// Money parsing & formatting
export { parseAmountToPaise, formatPaise, type FormatPaiseOptions } from './money.js';

// Rounding
export { roundToRupee } from './rounding.js';

// Tax calculations, variance & split
export { expectedTaxPaise, taxVariancePaise, varianceSeverity, splitTax } from './tax.js';

// Classification & State resolution
export {
  VALID_STATE_CODES,
  stateCodeFromGstin,
  classifySupply,
  resolveStateCode,
} from './classification.js';

// GSTIN validation & checksum
export { validateGstin } from './gstin.js';

// Bill amount validation
export { validateBillAmounts } from './validation.js';

// Utilities
export { financialYearOf, normalizeBillNumber } from './utils.js';
