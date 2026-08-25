import { describe, it, expect } from 'vitest';
import { paise } from './types.js';
import { roundToRupee } from './rounding.js';

describe('T1 · roundToRupee with HALF_DOWN (Company Rule)', () => {
  const cases: Array<[bigint, bigint, string]> = [
    [12340n, 12300n, '₹123.40 -> down'],
    [12349n, 12300n, '₹123.49 -> down'],
    [12350n, 12300n, '₹123.50 -> DOWN — company rule'],
    [12351n, 12400n, '₹123.51 -> up'],
    [12360n, 12400n, '₹123.60 -> up'],
    [12370n, 12400n, '₹123.70 -> up'],
    [12390n, 12400n, '₹123.90 -> up'],
    [12300n, 12300n, 'already whole'],
    [0n, 0n, 'zero'],
    [1n, 0n, '₹0.01 -> down'],
    [50n, 0n, '₹0.50 -> DOWN'],
    [51n, 100n, '₹0.51 -> up'],
    [99n, 100n, '₹0.99 -> up'],
    [-12350n, -12300n, 'magnitude tie -> down'],
    [-12360n, -12400n, 'negative up on magnitude'],
    [-50n, 0n, 'negative ₹0.50 -> 0'],
  ];

  for (const [input, expected, label] of cases) {
    it(`rounds ${input} paise to ${expected} paise (${label})`, () => {
      expect(roundToRupee(paise(input), 'HALF_DOWN')).toBe(paise(expected));
    });
  }
});

describe('T2 · roundToRupee with HALF_UP (Section 170 CGST Act)', () => {
  const cases: Array<[bigint, bigint, string]> = [
    [12350n, 12400n, '₹123.50 -> UP'],
    [50n, 100n, '₹0.50 -> UP'],
    [-12350n, -12400n, 'negative ₹123.50 -> -₹124 on magnitude'],
    [12349n, 12300n, 'unchanged below half'],
    [12351n, 12400n, 'unchanged above half'],
    [0n, 0n, 'zero'],
    [-50n, -100n, 'negative ₹0.50 -> -100'],
  ];

  for (const [input, expected, label] of cases) {
    it(`rounds ${input} paise to ${expected} paise (${label})`, () => {
      expect(roundToRupee(paise(input), 'HALF_UP')).toBe(paise(expected));
    });
  }
});
