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

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

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
  | 'EMPTY'
  | 'NOT_A_NUMBER'
  | 'MALFORMED'
  | 'TOO_MANY_DECIMALS'
  | 'NEGATIVE_NOT_ALLOWED';

export type MoneyError = AmountError;

/**
 * Error codes for GSTIN parsing and validation.
 */
export type GstinError =
  | 'INVALID_LENGTH'
  | 'INVALID_FORMAT'
  | 'INVALID_STATE_CODE'
  | 'INVALID_CHECKSUM';

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
  readonly flags: Array<'SPLIT_ASYMMETRY' | 'SPLIT_FROM_ENTERED'>;
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

/**
 * Org Unit / Branch representation.
 */
export interface OrgUnit {
  readonly id: string;
  readonly name: string;
  readonly shortName: string;
  readonly gstin: string;
  readonly stateCode: string;
  readonly addressLine?: string | null;
  readonly city?: string | null;
  readonly pincode?: string | null;
  readonly invoiceSeriesLabel?: string | null;
  readonly isDefault: boolean;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt?: string | null;
  readonly rowVersion: number;
}

/**
 * Party (Supplier / Customer) representation.
 */
export interface Party {
  readonly id: string;
  readonly displayName: string;
  readonly displayNameNorm: string;
  readonly legalName?: string | null;
  readonly gstin?: string | null;
  readonly gstinVerified: boolean;
  readonly stateCode: string;
  readonly addressLine?: string | null;
  readonly city?: string | null;
  readonly pincode?: string | null;
  readonly phone?: string | null;
  readonly isSupplier: boolean;
  readonly isCustomer: boolean;
  readonly isActive: boolean;
  readonly notes?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt?: string | null;
  readonly rowVersion: number;
}

/**
 * Period (GST reporting month) representation.
 */
export interface Period {
  readonly id: string;
  readonly financialYear: string;
  readonly year: number;
  readonly month: number;
  readonly label: string;
  readonly status: 'OPEN' | 'CLOSED';
  readonly openedAt: string;
  readonly closedAt?: string | null;
  readonly closedBy?: string | null;
  readonly notes?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt?: string | null;
  readonly rowVersion: number;
}

/**
 * Opening credit carried forward into a period.
 */
export interface PeriodOpeningCredit {
  readonly id: string;
  readonly periodId: string;
  readonly amountPaise: Paise;
  readonly sourceNote?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt?: string | null;
  readonly rowVersion: number;
}

export type BillDirection = 'PURCHASE' | 'SALE';
export type BillStatus = 'ACTIVE' | 'CANCELLED';
export type PaymentStatus = 'UNKNOWN' | 'UNPAID' | 'PARTIAL' | 'PAID';
export type ItcStatus = 'NOT_TRACKED' | 'ELIGIBLE' | 'INELIGIBLE';

/**
 * Bill (Invoice) representation in the ledger.
 */
export interface Bill {
  readonly id: string;
  readonly direction: BillDirection;
  readonly periodId: string;
  readonly orgUnitId?: string | null;
  readonly partyId?: string | null;
  readonly billNumber: string;
  readonly billNumberNorm: string;
  readonly billDate: string;
  readonly receivedDate?: string | null;
  readonly financialYear: string;
  readonly placeOfSupplyStateCode: string;
  readonly supplyType: SupplyType;
  readonly supplyTypeOverrideReason?: string | null;
  readonly totalAmountPaise: Paise;
  readonly taxAmountPaise: Paise;
  readonly taxableAmountPaise: Paise;
  readonly cgstPaise: Paise;
  readonly sgstPaise: Paise;
  readonly igstPaise: Paise;
  readonly cessPaise: Paise;
  readonly primaryRateBps?: bigint | null;
  readonly isMultiRate: boolean;
  readonly taxVariancePaise: Paise;
  readonly splitFlags: Array<'SPLIT_ASYMMETRY' | 'SPLIT_FROM_ENTERED'>;
  readonly varianceNote?: string | null;
  readonly status: BillStatus;
  readonly cancellationReason?: string | null;
  readonly paymentStatus: PaymentStatus;
  readonly paymentNote?: string | null;
  readonly itcStatus: ItcStatus;
  readonly notes?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt?: string | null;
  readonly rowVersion: number;
}

/**
 * Per-rate line item breakdown for a bill.
 */
export interface BillTaxLine {
  readonly id: string;
  readonly billId: string;
  readonly lineNo: number;
  readonly rateBps: bigint;
  readonly taxablePaise: Paise;
  readonly cgstPaise: Paise;
  readonly sgstPaise: Paise;
  readonly igstPaise: Paise;
  readonly cessPaise: Paise;
  readonly description?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt?: string | null;
  readonly rowVersion: number;
}

/**
 * Structured error returned when a hard duplicate is detected.
 */
export interface DuplicateBillError {
  readonly code: 'DUPLICATE_BILL';
  readonly message: string;
  readonly existingBill: {
    readonly id: string;
    readonly billNumber: string;
    readonly billDate: string;
    readonly totalAmountPaise: Paise;
    readonly financialYear: string;
    readonly direction: BillDirection;
    readonly partyId?: string | null;
    readonly orgUnitId?: string | null;
  };
}

/**
 * Soft duplicate match result for probable duplicates.
 */
export interface ProbableDuplicateMatch {
  readonly id: string;
  readonly billNumber: string;
  readonly billDate: string;
  readonly totalAmountPaise: Paise;
  readonly partyId?: string | null;
  readonly orgUnitId?: string | null;
  readonly daysDifference: number;
}

/**
 * Input payload to create a new Bill.
 */
export interface CreateBillInput {
  readonly direction: BillDirection;
  readonly periodId: string;
  readonly orgUnitId?: string | null;
  readonly partyId?: string | null;
  readonly billNumber: string;
  readonly billDate: string;
  readonly receivedDate?: string | null;
  readonly placeOfSupplyStateCode?: string | null;
  readonly supplyType?: SupplyType | null;
  readonly supplyTypeOverrideReason?: string | null;
  readonly totalAmountPaise: Paise;
  readonly taxAmountPaise: Paise;
  readonly primaryRateBps?: bigint | null;
  readonly isMultiRate?: boolean;
  readonly varianceNote?: string | null;
  readonly status?: BillStatus;
  readonly cancellationReason?: string | null;
  readonly paymentStatus?: PaymentStatus;
  readonly paymentNote?: string | null;
  readonly itcStatus?: ItcStatus;
  readonly notes?: string | null;
  readonly taxLines?: Array<{
    readonly lineNo: number;
    readonly rateBps: bigint;
    readonly taxablePaise: Paise;
    readonly cgstPaise?: Paise;
    readonly sgstPaise?: Paise;
    readonly igstPaise?: Paise;
    readonly cessPaise?: Paise;
    readonly description?: string | null;
  }>;
}
