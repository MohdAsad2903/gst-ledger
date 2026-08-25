import { describe, it, expect } from 'vitest';
import { paise } from './types.js';
import { validateBillAmounts } from './validation.js';

describe('validateBillAmounts & RATE_NOT_RECOGNISED', () => {
  const standardRates = [0n, 500n, 1800n, 4000n]; // 0%, 5%, 18%, 40%

  it('flags TOTAL_ZERO when total is 0 and status is ACTIVE', () => {
    const issues = validateBillAmounts({
      totalPaise: paise(0n),
      taxPaise: paise(0n),
      status: 'ACTIVE',
      suppliedRatesBps: standardRates,
    });
    expect(issues).toContainEqual({
      code: 'TOTAL_ZERO',
      severity: 'BLOCK',
      field: 'total',
      message: 'Total amount must be more than zero.',
    });
  });

  it('allows 0 total when status is CANCELLED', () => {
    const issues = validateBillAmounts({
      totalPaise: paise(0n),
      taxPaise: paise(0n),
      status: 'CANCELLED',
      suppliedRatesBps: standardRates,
    });
    expect(issues.some(i => i.code === 'TOTAL_ZERO')).toBe(false);
  });

  it('flags NEGATIVE_AMOUNT when total or tax is negative', () => {
    const issuesTotalNeg = validateBillAmounts({
      totalPaise: paise(-1000n),
      taxPaise: paise(100n),
      status: 'ACTIVE',
    });
    expect(issuesTotalNeg).toContainEqual({
      code: 'NEGATIVE_AMOUNT',
      severity: 'BLOCK',
      field: 'general',
      message: 'Amounts cannot be negative. Use a credit note instead.',
    });

    const issuesTaxNeg = validateBillAmounts({
      totalPaise: paise(1000n),
      taxPaise: paise(-100n),
      status: 'ACTIVE',
    });
    expect(issuesTaxNeg).toContainEqual({
      code: 'NEGATIVE_AMOUNT',
      severity: 'BLOCK',
      field: 'general',
      message: 'Amounts cannot be negative. Use a credit note instead.',
    });
  });

  it('flags TAX_EXCEEDS_TOTAL when tax > total', () => {
    const issues = validateBillAmounts({
      totalPaise: paise(10000n),
      taxPaise: paise(12000n),
      status: 'ACTIVE',
    });
    expect(issues).toContainEqual({
      code: 'TAX_EXCEEDS_TOTAL',
      severity: 'BLOCK',
      field: 'tax',
      message: 'GST cannot be more than the total amount.',
    });
  });

  it('flags TAX_EQUALS_TOTAL when tax === total > 0', () => {
    const issues = validateBillAmounts({
      totalPaise: paise(5000n),
      taxPaise: paise(5000n),
      status: 'ACTIVE',
    });
    expect(issues).toContainEqual({
      code: 'TAX_EQUALS_TOTAL',
      severity: 'BLOCK',
      field: 'tax',
      message: 'GST cannot equal the total amount — check the two figures.',
    });
  });

  it('flags ZERO_TAX when tax is 0 and total > 0', () => {
    const issues = validateBillAmounts({
      totalPaise: paise(10000n),
      taxPaise: paise(0n),
      status: 'ACTIVE',
      suppliedRatesBps: standardRates,
    });
    expect(issues).toContainEqual({
      code: 'ZERO_TAX',
      severity: 'CONFIRM',
      field: 'tax',
      message: 'This bill has no GST. Is the supplier exempt or unregistered?',
    });
  });

  it('flags UNUSUALLY_LARGE when total > ₹1,00,00,000 (1 Crore)', () => {
    const issues = validateBillAmounts({
      totalPaise: paise(1000000001n), // 1 Crore + 1 paise
      taxPaise: paise(180000000n),
      status: 'ACTIVE',
      suppliedRatesBps: standardRates,
    });
    expect(issues).toContainEqual({
      code: 'UNUSUALLY_LARGE',
      severity: 'CONFIRM',
      field: 'total',
      message: 'That is an unusually large amount. Please confirm it is correct.',
    });
  });

  it('flags RATE_NOT_RECOGNISED for Swarn Enterprises (16.2% implied rate)', () => {
    // Swarn Enterprises bill from July 2026:
    // Taxable ₹4,176, GST ₹677 -> Total ₹4,853 (485300 paise), GST ₹677 (67700 paise)
    const issues = validateBillAmounts({
      totalPaise: paise(485300n),
      taxPaise: paise(67700n),
      status: 'ACTIVE',
      suppliedRatesBps: standardRates,
    });

    expect(issues).toContainEqual({
      code: 'RATE_NOT_RECOGNISED',
      severity: 'WARN',
      field: 'rate',
      message:
        'This works out to 16.2%, which is not one of the usual rates. Is it a mixed-rate bill?',
    });
  });

  it('accepts standard 18% bill without RATE_NOT_RECOGNISED', () => {
    // Total ₹1,41,542, GST ₹21,591 -> Taxable ₹1,19,951 (18%)
    const issues = validateBillAmounts({
      totalPaise: paise(14154200n),
      taxPaise: paise(2159100n),
      status: 'ACTIVE',
      suppliedRatesBps: standardRates,
    });

    expect(issues.some(i => i.code === 'RATE_NOT_RECOGNISED')).toBe(false);
  });
});
