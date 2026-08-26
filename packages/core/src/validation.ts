import type { MoneyError, Paise, ValidationIssue } from './types.js';

/**
 * Maps an AmountError/MoneyError code to a clear, plain-language error message.
 *
 * @param error AmountError code
 * @param field Field name ('total' or 'tax')
 * @returns Plain-language message
 */
export function messageForAmountError(error: MoneyError, field: 'total' | 'tax'): string {
  switch (error) {
    case 'EMPTY':
      return field === 'total' ? 'Enter the total amount.' : 'Enter the GST amount.';
    case 'NOT_A_NUMBER':
      return 'Enter an amount using numbers only.';
    case 'MALFORMED':
      return 'That amount is not in a recognised format.';
    case 'TOO_MANY_DECIMALS':
      return 'Enter at most two decimal places.';
    case 'NEGATIVE_NOT_ALLOWED':
      return 'Amounts cannot be negative. Use a credit note instead.';
  }
}

/**
 * 1 Crore in Paise = ₹1,00,00,000 * 100 paise = 1,000,000,000 paise.
 */
const ONE_CRORE_PAISE = 1_000_000_000n;

/**
 * Validates bill monetary amounts and returns structured issues.
 *
 * Rules checked:
 * - total = 0 and status ACTIVE -> TOTAL_ZERO (BLOCK)
 * - total < 0 or tax < 0 -> NEGATIVE_AMOUNT (BLOCK)
 * - tax > total -> TAX_EXCEEDS_TOTAL (BLOCK)
 * - tax = total and total > 0 -> TAX_EQUALS_TOTAL (BLOCK)
 * - tax = 0 and total > 0 -> ZERO_TAX (CONFIRM)
 * - total > ₹1,00,00,000 -> UNUSUALLY_LARGE (CONFIRM)
 * - implied rate matches no supplied rate within ±0.5% (±50 bps) -> RATE_NOT_RECOGNISED (WARN)
 *
 * Messages are written in clear, plain language stating what happened and what to do next.
 *
 * @param input Bill validation parameters (totalPaise, taxPaise, status, optional suppliedRatesBps)
 * @returns Array of ValidationIssue objects
 */
export function validateBillAmounts(input: {
  totalPaise: Paise;
  taxPaise: Paise;
  status: 'ACTIVE' | 'CANCELLED';
  suppliedRatesBps?: readonly bigint[];
}): ValidationIssue[] {
  const { totalPaise, taxPaise, status, suppliedRatesBps } = input;
  const issues: ValidationIssue[] = [];

  // Rule 1: Zero total on active bill
  if (totalPaise === 0n && status === 'ACTIVE') {
    issues.push({
      code: 'TOTAL_ZERO',
      severity: 'BLOCK',
      field: 'total',
      message: 'Total amount must be more than zero.',
    });
  }

  // Rule 2: Negative amounts
  if (totalPaise < 0n || taxPaise < 0n) {
    issues.push({
      code: 'NEGATIVE_AMOUNT',
      severity: 'BLOCK',
      field: 'general',
      message: 'Amounts cannot be negative. Use a credit note instead.',
    });
  }

  // Rule 3: Tax exceeds total
  if (taxPaise > totalPaise && totalPaise >= 0n && taxPaise >= 0n) {
    issues.push({
      code: 'TAX_EXCEEDS_TOTAL',
      severity: 'BLOCK',
      field: 'tax',
      message: 'GST cannot be more than the total amount.',
    });
  }

  // Rule 4: Tax equals total
  if (taxPaise === totalPaise && totalPaise > 0n) {
    issues.push({
      code: 'TAX_EQUALS_TOTAL',
      severity: 'BLOCK',
      field: 'tax',
      message: 'GST cannot equal the total amount — check the two figures.',
    });
  }

  // Rule 5: Zero tax on positive total
  if (taxPaise === 0n && totalPaise > 0n) {
    issues.push({
      code: 'ZERO_TAX',
      severity: 'CONFIRM',
      field: 'tax',
      message: 'This bill has no GST. Is the supplier exempt or unregistered?',
    });
  }

  // Rule 6: Unusually large total (> ₹1 Crore)
  if (totalPaise > ONE_CRORE_PAISE) {
    issues.push({
      code: 'UNUSUALLY_LARGE',
      severity: 'CONFIRM',
      field: 'total',
      message: 'That is an unusually large amount. Please confirm it is correct.',
    });
  }

  // Rule 7: Implied rate recognition check
  if (totalPaise > taxPaise && taxPaise > 0n && suppliedRatesBps && suppliedRatesBps.length > 0) {
    const taxablePaise = totalPaise - taxPaise;
    // Implied rate in basis points (rounded to nearest bps)
    const impliedRateBps = (taxPaise * 10000n + taxablePaise / 2n) / taxablePaise;

    const matched = suppliedRatesBps.some(rate => {
      const diff = impliedRateBps > rate ? impliedRateBps - rate : rate - impliedRateBps;
      return diff <= 50n; // within ±0.5% (50 bps)
    });

    if (!matched) {
      // Calculate percentage with 1 decimal place (e.g. 16.2)
      const pctTimes10 = (taxPaise * 1000n + taxablePaise / 2n) / taxablePaise;
      const whole = pctTimes10 / 10n;
      const dec = pctTimes10 % 10n;
      const pctStr = dec === 0n ? `${whole}` : `${whole}.${dec}`;

      issues.push({
        code: 'RATE_NOT_RECOGNISED',
        severity: 'WARN',
        field: 'rate',
        message: `This works out to ${pctStr}%, which is not one of the usual rates. Is it a mixed-rate bill?`,
      });
    }
  }

  return issues;
}
