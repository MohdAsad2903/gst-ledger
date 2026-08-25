import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { paise, type RoundingRule, type SupplyType } from './types.js';
import { roundToRupee } from './rounding.js';
import { expectedTaxPaise, splitTax } from './tax.js';
import { formatPaise, parseAmountToPaise } from './money.js';

describe('T13 · Property-Based Tests (fast-check)', () => {
  const rules: RoundingRule[] = ['HALF_DOWN', 'HALF_UP'];
  const supplyTypes: SupplyType[] = ['INTRA', 'INTER'];

  it('roundToRupee(x, rule) % 100n === 0n — always a whole rupee', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: -100_000_000_000n, max: 100_000_000_000n }),
        fc.constantFrom(...rules),
        (n, rule) => {
          const rounded = roundToRupee(paise(n), rule);
          return rounded % 100n === 0n;
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('abs(roundToRupee(x, rule) - x) <= 50n — never moves more than half a rupee', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: -100_000_000_000n, max: 100_000_000_000n }),
        fc.constantFrom(...rules),
        (n, rule) => {
          const rounded = roundToRupee(paise(n), rule);
          const diff = rounded > n ? rounded - n : n - rounded;
          return diff <= 50n;
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('roundToRupee(-x, rule) === -roundToRupee(x, rule) — sign symmetry', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: -100_000_000_000n, max: 100_000_000_000n }),
        fc.constantFrom(...rules),
        (n, rule) => {
          const pos = roundToRupee(paise(n), rule);
          const neg = roundToRupee(paise(-n), rule);
          return neg === -pos;
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('splitTax always satisfies cgst + sgst + igst === totalTax', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 100_000_000_000n }), // taxable
        fc.bigInt({ min: 0n, max: 30_000_000_000n }), // totalTax
        fc.constantFrom(0n, 500n, 1800n, 4000n), // rateBps
        fc.constantFrom(...supplyTypes),
        fc.constantFrom(...rules),
        (taxableN, totalTaxN, rateBps, supplyType, rule) => {
          const split = splitTax({
            taxable: paise(taxableN),
            totalTax: paise(totalTaxN),
            rateBps,
            supplyType,
            rule,
          });
          const sum = split.cgst + split.sgst + split.igst;
          return sum === paise(totalTaxN);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('parseAmountToPaise(formatPaise(x)).value === x — round-trip stability', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 1_000_000_000_000n }), // non-negative amounts
        n => {
          const original = paise(n);
          const formatted = formatPaise(original);
          const parsed = parseAmountToPaise(formatted);
          expect(parsed.ok).toBe(true);
          if (parsed.ok) {
            return parsed.value === original;
          }
          return false;
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('expectedTaxPaise(x, 0n, rule) === 0n — zero rate always yields zero tax', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: -100_000_000_000n, max: 100_000_000_000n }),
        fc.constantFrom(...rules),
        (n, rule) => {
          const tax = expectedTaxPaise(paise(n), 0n, rule);
          return tax === paise(0n);
        },
      ),
      { numRuns: 500 },
    );
  });
});
