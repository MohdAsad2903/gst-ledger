import { describe, it, expect } from 'vitest';
import { financialYearOf, normalizeBillNumber } from './utils.js';

describe('T8 · financialYearOf (Indian Financial Year: 1 April - 31 March)', () => {
  const cases = [
    { input: '2026-04-01', expected: '2026-27' },
    { input: '2026-07-01', expected: '2026-27' },
    { input: '2027-03-31', expected: '2026-27' },
    { input: '2027-04-01', expected: '2027-28' },
    { input: '2026-03-31', expected: '2025-26' },
    { input: ' 2026-07-15 ', expected: '2026-27' },
  ];

  for (const c of cases) {
    it(`computes financial year for "${c.input}" -> "${c.expected}"`, () => {
      expect(financialYearOf(c.input)).toBe(c.expected);
    });
  }

  it('throws on malformed date string', () => {
    expect(() => financialYearOf('invalid-date')).toThrow();
    expect(() => financialYearOf('2026')).toThrow();
  });
});

describe('T9 · normalizeBillNumber', () => {
  const cases = [
    { input: 'GST-1291/26-27', expected: 'GST12912627' },
    { input: 'KNC/26-27/2448', expected: 'KNC26272448' },
    { input: '4S/1116/26-27 DL', expected: '4S11162627DL' },
    { input: 'SE-0335/2026-2027', expected: 'SE033520262027' },
    { input: '  63  ', expected: '63' },
  ];

  for (const c of cases) {
    it(`normalizes "${c.input}" -> "${c.expected}"`, () => {
      expect(normalizeBillNumber(c.input)).toBe(c.expected);
    });
  }
});
