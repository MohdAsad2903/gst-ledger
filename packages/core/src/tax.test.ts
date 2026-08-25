import { describe, it, expect } from 'vitest';
import { paise } from './types.js';
import { expectedTaxPaise, taxVariancePaise, varianceSeverity, splitTax } from './tax.js';

describe('T3 · expectedTaxPaise at 18% (1800n, HALF_DOWN) — Real July 2026 Register Bills', () => {
  const registerBills: Array<{ name: string; taxableRupees: bigint; expectedRupees: bigint }> = [
    { name: 'Durga Metals GST-1291', taxableRupees: 119951n, expectedRupees: 21591n },
    { name: 'Durga Metals GST-1305', taxableRupees: 47145n, expectedRupees: 8486n },
    { name: 'Durga Metals GST-1502', taxableRupees: 11590n, expectedRupees: 2086n },
    { name: 'Durga Metals GST-1672', taxableRupees: 86861n, expectedRupees: 15635n },
    { name: 'Durga Metals GST-1729', taxableRupees: 749145n, expectedRupees: 134846n },
    { name: 'Metal Max 62', taxableRupees: 24420n, expectedRupees: 4396n },
    { name: 'Metal Max 69', taxableRupees: 193160n, expectedRupees: 34769n },
    { name: 'Metal Max 73', taxableRupees: 110880n, expectedRupees: 19958n },
    { name: 'Metal Max 77', taxableRupees: 540250n, expectedRupees: 97245n },
    { name: 'Metal Max 85', taxableRupees: 30008n, expectedRupees: 5401n },
    { name: 'Shivam Enterprises', taxableRupees: 271503n, expectedRupees: 48871n },
    { name: 'Vardhman 0931', taxableRupees: 1890n, expectedRupees: 340n },
    { name: 'Vardhman 0984', taxableRupees: 1320n, expectedRupees: 238n },
    { name: 'Nav Bharat 1673', taxableRupees: 3255n, expectedRupees: 586n },
    { name: 'Nav Bharat 1681', taxableRupees: 2638n, expectedRupees: 475n },
    { name: 'Kedarnath 2448', taxableRupees: 855n, expectedRupees: 154n },
    { name: 'Chand Company', taxableRupees: 31104n, expectedRupees: 5599n },
    { name: 'Vanshika Steels', taxableRupees: 2627n, expectedRupees: 473n },
    { name: 'Anand Machinery 4573', taxableRupees: 7748n, expectedRupees: 1395n },
    { name: 'Anand Machinery 5544', taxableRupees: 3208n, expectedRupees: 577n },
    { name: 'Taneja Traders 485', taxableRupees: 2245n, expectedRupees: 404n },
    { name: 'Prakash Machinery 3224', taxableRupees: 2190n, expectedRupees: 394n },
    { name: 'Sapna Steels 399', taxableRupees: 13649n, expectedRupees: 2457n },
    { name: 'Jyoti Steel 296', taxableRupees: 6835n, expectedRupees: 1230n },
    { name: 'Sale bill 82', taxableRupees: 20150n, expectedRupees: 3627n },
  ];

  for (const bill of registerBills) {
    it(`calculates exact tax for ${bill.name} (Taxable ₹${bill.taxableRupees} -> Expected ₹${bill.expectedRupees})`, () => {
      const taxablePaise = paise(bill.taxableRupees * 100n);
      const calculatedPaise = expectedTaxPaise(taxablePaise, 1800n, 'HALF_DOWN');
      expect(calculatedPaise).toBe(paise(bill.expectedRupees * 100n));
    });
  }

  it('handles negative taxable amounts symmetrically', () => {
    const taxablePaise = paise(-11995100n);
    const calculatedPaise = expectedTaxPaise(taxablePaise, 1800n, 'HALF_DOWN');
    expect(calculatedPaise).toBe(paise(-2159100n));
  });

  it('returns 0 paise when taxable or rate is 0', () => {
    expect(expectedTaxPaise(paise(0n), 1800n, 'HALF_DOWN')).toBe(paise(0n));
    expect(expectedTaxPaise(paise(100000n), 0n, 'HALF_DOWN')).toBe(paise(0n));
  });
});

describe('T4 · Exact-tie cases at 18% ((18 * amount) mod 100 === 50)', () => {
  const tieCases: Array<[bigint, bigint, bigint]> = [
    [25n, 4n, 5n],
    [75n, 13n, 14n],
    [125n, 22n, 23n],
    [175n, 31n, 32n],
    [225n, 40n, 41n],
  ];

  for (const [rupees, downExpected, upExpected] of tieCases) {
    it(`ties on ₹${rupees}: HALF_DOWN -> ₹${downExpected}, HALF_UP -> ₹${upExpected}`, () => {
      const taxablePaise = paise(rupees * 100n);
      const down = expectedTaxPaise(taxablePaise, 1800n, 'HALF_DOWN');
      const up = expectedTaxPaise(taxablePaise, 1800n, 'HALF_UP');
      expect(down).toBe(paise(downExpected * 100n));
      expect(up).toBe(paise(upExpected * 100n));
    });
  }
});

describe('T5 · Variance — Four Real Disagreements from the Register', () => {
  const defaults = { infoPaise: 200n, warnPaise: 10000n }; // info <= ₹2, warn <= ₹100

  const cases = [
    {
      name: 'Metal Max 85',
      taxableRupees: 30008n,
      enteredRupees: 5402n,
      rateBps: 1800n,
      expectedVarianceRupees: 1n,
      expectedSeverity: 'INFO' as const,
    },
    {
      name: 'Shivam Enterprises',
      taxableRupees: 271503n,
      enteredRupees: 48870n,
      rateBps: 1800n,
      expectedVarianceRupees: -1n,
      expectedSeverity: 'INFO' as const,
    },
    {
      name: 'Anand Machinery 4573',
      taxableRupees: 7748n,
      enteredRupees: 1394n,
      rateBps: 1800n,
      expectedVarianceRupees: -1n,
      expectedSeverity: 'INFO' as const,
    },
    {
      name: 'Swarn Enterprises (18% + 5%)',
      taxableRupees: 4176n,
      enteredRupees: 677n,
      rateBps: 1800n,
      expectedVarianceRupees: -75n,
      expectedSeverity: 'WARN' as const,
    },
  ];

  for (const c of cases) {
    it(`reproduces variance for ${c.name} without altering entered figure`, () => {
      const enteredPaise = paise(c.enteredRupees * 100n);
      const taxablePaise = paise(c.taxableRupees * 100n);
      const variance = taxVariancePaise(enteredPaise, taxablePaise, c.rateBps, 'HALF_DOWN');
      expect(variance).toBe(paise(c.expectedVarianceRupees * 100n));

      const severity = varianceSeverity(variance, defaults);
      expect(severity).toBe(c.expectedSeverity);
    });
  }

  it('correctly categorizes all variance severity bands', () => {
    expect(varianceSeverity(paise(0n), defaults)).toBe('NONE');
    expect(varianceSeverity(paise(100n), defaults)).toBe('INFO');
    expect(varianceSeverity(paise(200n), defaults)).toBe('INFO');
    expect(varianceSeverity(paise(201n), defaults)).toBe('WARN');
    expect(varianceSeverity(paise(10000n), defaults)).toBe('WARN');
    expect(varianceSeverity(paise(10001n), defaults)).toBe('CONFIRM');
    expect(varianceSeverity(paise(-10001n), defaults)).toBe('CONFIRM');
  });
});

describe('T7 · splitTax — cgst + sgst === totalTax in Every Case', () => {
  const intraCases = [
    { taxable: 119951n, totalTax: 21591n, cgst: 10796n, sgst: 10795n },
    { taxable: 51000n, totalTax: 9180n, cgst: 4590n, sgst: 4590n },
    { taxable: 3255n, totalTax: 586n, cgst: 293n, sgst: 293n },
    { taxable: 2638n, totalTax: 475n, cgst: 237n, sgst: 238n },
    { taxable: 24700n, totalTax: 4446n, cgst: 2223n, sgst: 2223n },
    { taxable: 13000n, totalTax: 2340n, cgst: 1170n, sgst: 1170n },
  ];

  for (const c of intraCases) {
    it(`splits tax for ₹${c.taxable} taxable (CGST ₹${c.cgst}, SGST ₹${c.sgst}, Total ₹${c.totalTax})`, () => {
      const split = splitTax({
        supplyType: 'INTRA',
        taxable: paise(c.taxable * 100n),
        totalTax: paise(c.totalTax * 100n),
        rateBps: 1800n,
        rule: 'HALF_DOWN',
      });

      expect(split.cgst).toBe(paise(c.cgst * 100n));
      expect(split.sgst).toBe(paise(c.sgst * 100n));
      expect(split.igst).toBe(paise(0n));
      expect(split.cgst + split.sgst).toBe(paise(c.totalTax * 100n));
    });
  }

  it('handles INTER supply correctly (Shivam Enterprises ₹2,71,503 taxable, ₹48,870 tax)', () => {
    const split = splitTax({
      supplyType: 'INTER',
      taxable: paise(27150300n),
      totalTax: paise(4887000n),
      rateBps: 1800n,
      rule: 'HALF_DOWN',
    });

    expect(split.igst).toBe(paise(4887000n));
    expect(split.cgst).toBe(paise(0n));
    expect(split.sgst).toBe(paise(0n));
    expect(split.flags).toEqual([]);
  });

  it('flags SPLIT_ASYMMETRY when |cgst - sgst| > ₹1', () => {
    const split = splitTax({
      supplyType: 'INTRA',
      taxable: paise(1000000n), // 10000 rupees
      totalTax: paise(300000n), // 3000 rupees entered tax (different from expected 1800)
      rateBps: 1800n,
      rule: 'HALF_DOWN',
    });
    // cgst = 9% of 10000 = 900 rupees (90000 paise). sgst = 3000 - 900 = 2100 rupees (210000 paise). diff = 1200 rupees > 1 rupee.
    expect(split.flags).toContain('SPLIT_ASYMMETRY');
  });
});

describe('T14 · Scale Test (BigInt Precision)', () => {
  it('handles ₹9,99,99,99,999.99 without overflow or precision loss', () => {
    const hugeTaxable = paise(999999999999n); // ₹9,99,99,99,999.99
    const tax = expectedTaxPaise(hugeTaxable, 1800n, 'HALF_DOWN');
    // 18% of 9999999999.99 = 1799999999.9982 -> rounds to 1800000000.00 = 180000000000n paise
    expect(tax).toBe(paise(180000000000n));
    expect(typeof tax).toBe('bigint');
  });
});
