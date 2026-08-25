import { describe, it, expect } from 'vitest';
import * as Core from './index.js';

describe('packages/core barrel export', () => {
  it('exports all expected API functions and constants', () => {
    expect(typeof Core.paise).toBe('function');
    expect(typeof Core.parseAmountToPaise).toBe('function');
    expect(typeof Core.formatPaise).toBe('function');
    expect(typeof Core.roundToRupee).toBe('function');
    expect(typeof Core.expectedTaxPaise).toBe('function');
    expect(typeof Core.taxVariancePaise).toBe('function');
    expect(typeof Core.varianceSeverity).toBe('function');
    expect(typeof Core.splitTax).toBe('function');
    expect(typeof Core.classifySupply).toBe('function');
    expect(typeof Core.resolveStateCode).toBe('function');
    expect(typeof Core.stateCodeFromGstin).toBe('function');
    expect(typeof Core.validateGstin).toBe('function');
    expect(typeof Core.validateBillAmounts).toBe('function');
    expect(typeof Core.financialYearOf).toBe('function');
    expect(typeof Core.normalizeBillNumber).toBe('function');
    expect(Core.COMPANY_ROUNDING_RULE).toBe('HALF_DOWN');
    expect(Core.VALID_STATE_CODES.size).toBe(40);
  });
});
