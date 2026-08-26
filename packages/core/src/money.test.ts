import { describe, it, expect } from 'vitest';
import { paise } from './types.js';
import {
  parseAmountToPaise,
  formatPaise,
  paiseToDecimalString,
  decimalStringToPaise,
} from './money.js';

describe('T11 · parseAmountToPaise', () => {
  const acceptCases = [
    { input: '182644', expected: 18264400n },
    { input: '1,82,644', expected: 18264400n },
    { input: '1,82,644.00', expected: 18264400n },
    { input: '₹1,82,644', expected: 18264400n },
    { input: '₹ 1,82,644.50', expected: 18264450n },
    { input: ' 182644 ', expected: 18264400n },
    { input: '0.01', expected: 1n },
    { input: '0', expected: 0n },
    { input: '1234.5', expected: 123450n },
    { input: '.50', expected: 50n },
    { input: '.5', expected: 50n },
    { input: '0.', expected: 0n },
    { input: '100.', expected: 10000n },
  ];

  for (const c of acceptCases) {
    it(`accepts "${c.input}" -> ${c.expected} paise`, () => {
      const result = parseAmountToPaise(c.input);
      expect(result).toEqual({ ok: true, value: paise(c.expected) });
    });
  }

  const rejectCases = [
    { input: '.', error: 'MALFORMED' as const },
    { input: '₹.', error: 'MALFORMED' as const },
    { input: '1-2', error: 'MALFORMED' as const },
    { input: '1.234', error: 'TOO_MANY_DECIMALS' as const },
    { input: '1.2.3', error: 'MALFORMED' as const },
    { input: 'abc', error: 'NOT_A_NUMBER' as const },
    { input: '', error: 'EMPTY' as const },
    { input: '   ', error: 'EMPTY' as const },
    { input: '₹', error: 'EMPTY' as const },
    { input: '-100', error: 'NEGATIVE_NOT_ALLOWED' as const },
    { input: '1e5', error: 'MALFORMED' as const },
    { input: '1.2,3', error: 'MALFORMED' as const },
    { input: '12#45', error: 'NOT_A_NUMBER' as const },
    { input: '123.4.5', error: 'MALFORMED' as const },
    { input: '123.4a', error: 'NOT_A_NUMBER' as const },
    { input: '123.456', error: 'TOO_MANY_DECIMALS' as const },
    { input: '123.4,5', error: 'MALFORMED' as const },
  ];

  for (const c of rejectCases) {
    it(`rejects "${c.input}" -> ${c.error}`, () => {
      const result = parseAmountToPaise(c.input);
      expect(result).toEqual({ ok: false, error: c.error });
    });
  }
});

describe('Defect 4 · paiseToDecimalString & decimalStringToPaise', () => {
  it('formats amounts as plain decimal strings without commas or currency symbols', () => {
    expect(paiseToDecimalString(paise(11995100n))).toBe('119951.00');
    expect(paiseToDecimalString(paise(-100n))).toBe('-1.00');
    expect(paiseToDecimalString(paise(0n))).toBe('0.00');
    expect(paiseToDecimalString(paise(50n))).toBe('0.50');
    expect(paiseToDecimalString(paise(27150300n))).toBe('271503.00');
  });

  it('round-trips decimalStringToPaise(paiseToDecimalString(p)) === p', () => {
    const testPaise = [0n, 1n, 50n, 99n, 100n, 11995100n, -100n, -27150300n];
    for (const val of testPaise) {
      const p = paise(val);
      const str = paiseToDecimalString(p);
      const res = decimalStringToPaise(str);
      expect(res).toEqual({ ok: true, value: p });
    }
  });
});

describe('T12 · formatPaise — Indian Digit Grouping', () => {
  const cases = [
    { amount: 18264400n, expected: '1,82,644.00' },
    { amount: 133067700n, expected: '13,30,677.00' },
    { amount: 872332700n, expected: '87,23,327.00' },
    { amount: 100000n, expected: '1,000.00' },
    { amount: 0n, expected: '0.00' },
    { amount: 47853600n, expected: '4,78,536.00' },
    { amount: 50n, expected: '0.50' },
    { amount: 99n, expected: '0.99' },
    { amount: 100n, expected: '1.00' },
  ];

  for (const c of cases) {
    it(`formats ${c.amount} paise as "${c.expected}"`, () => {
      expect(formatPaise(paise(c.amount))).toBe(c.expected);
    });
  }

  it('explicitly does not format 133067700 as Western "1,330,677.00"', () => {
    const formatted = formatPaise(paise(133067700n));
    expect(formatted).not.toBe('1,330,677.00');
    expect(formatted).toBe('13,30,677.00');
  });

  it('supports currency symbol option', () => {
    expect(formatPaise(paise(18264400n), { symbol: true })).toBe('₹1,82,644.00');
    expect(formatPaise(paise(-18264400n), { symbol: true })).toBe('-₹1,82,644.00');
  });

  it('Defect 5: rounds instead of truncating when decimals is 0', () => {
    expect(formatPaise(paise(12399n), { decimals: 0 })).toBe('124');
    expect(formatPaise(paise(12350n), { decimals: 0, roundingRule: 'HALF_DOWN' })).toBe('123');
    expect(formatPaise(paise(12350n), { decimals: 0, roundingRule: 'HALF_UP' })).toBe('124');
    expect(formatPaise(paise(18264400n), { decimals: 0 })).toBe('1,82,644');
  });

  it('handles negative amounts correctly', () => {
    expect(formatPaise(paise(-18264400n))).toBe('-1,82,644.00');
  });
});
