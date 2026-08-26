import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type Database from 'better-sqlite3';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  openDatabase,
  runMigrations,
  OrgUnitsRepository,
  PartiesRepository,
  PeriodsRepository,
  BillsRepository,
  SettingsRepository,
} from '../index.js';
import { paise } from '@gst/core';
import { loadJuly2026Fixture, parseFixtureCsv } from '../../../../scripts/load-fixture.js';

describe('Prompt 2A · Data Model, Duplicate Detection & July 2026 Fixture Verification', () => {
  let tempDir: string;
  let dbPath: string;
  let db: Database.Database;
  let billsRepo: BillsRepository;
  let partiesRepo: PartiesRepository;
  let orgUnitsRepo: OrgUnitsRepository;
  let periodsRepo: PeriodsRepository;
  let settingsRepo: SettingsRepository;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gst-prompt2a-test-'));
    dbPath = path.join(tempDir, 'test.sqlite');
    db = openDatabase(dbPath);
    runMigrations(db);

    billsRepo = new BillsRepository(db);
    partiesRepo = new PartiesRepository(db);
    orgUnitsRepo = new OrgUnitsRepository(db);
    periodsRepo = new PeriodsRepository(db);
    settingsRepo = new SettingsRepository(db);
  });

  afterEach(() => {
    if (db) {
      try {
        db.close();
      } catch {
        // ignore
      }
    }
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('Part Six: loads July 2026 fixture producing exact verified financial totals', () => {
    const summary = loadJuly2026Fixture(db);

    // Assertions matching Part Six table
    expect(summary.purchaseBillsLoaded).toBe(35);
    expect(summary.suppliersCreated).toBe(21);
    expect(summary.saleBillsLoaded).toBe(31);
    expect(summary.cancelledSaleBills).toBe(1);
    expect(summary.outputGstSalesPaise).toBe(133067700n); // ₹13,30,677
    expect(summary.inputGstPurchasesPaise).toBe(47853600n); // ₹4,78,536
    expect(summary.openingCreditPaise).toBe(12602800n); // ₹1,26,028
    expect(summary.netPayablePaise).toBe(72611300n); // ₹7,26,113

    // Verify all bills in database
    const period = periodsRepo.getByYearMonth(2026, 7)!;
    const allBills = billsRepo.listByPeriod(period.id);
    expect(allBills.length).toBe(67); // 35 purchases + 31 active sales + 1 cancelled sale

    // Lucknow series contains only bill 06
    const lkoBranch = orgUnitsRepo.list().find(u => u.shortName === 'Lucknow')!;
    const lkoBills = allBills.filter(b => b.orgUnitId === lkoBranch.id);
    expect(lkoBills.length).toBe(1);
    expect(lkoBills[0]?.billNumber).toBe('06');

    // Ghaziabad series runs 63-93 with no gaps
    const gzbBranch = orgUnitsRepo.list().find(u => u.shortName === 'Ghaziabad')!;
    const gzbBills = allBills.filter(b => b.orgUnitId === gzbBranch.id);
    expect(gzbBills.length).toBe(31);
    const gzbNumbers = gzbBills.map(b => Number(b.billNumber)).sort((a, b) => a - b);
    for (let i = 63; i <= 93; i++) {
      expect(gzbNumbers).toContain(i);
    }

    // Exactly 2 bills classify as INTER (Shivam Enterprises and Chand Company, both Delhi 07)
    const interBills = allBills.filter(b => b.supplyType === 'INTER');
    expect(interBills.length).toBe(2);
    const shivam = partiesRepo.getByNormName('SHIVAMENTERPRISES')!;
    const chand = partiesRepo.getByNormName('CHANDCOMPANY')!;
    expect(interBills.some(b => b.partyId === shivam.id)).toBe(true);
    expect(interBills.some(b => b.partyId === chand.id)).toBe(true);

    // Exactly 4 bills carry non-zero variance
    const varianceBills = allBills.filter(b => b.taxVariancePaise !== 0n);
    expect(varianceBills.length).toBe(4);

    const metalMax85 = allBills.find(b => b.billNumber === '85' && b.direction === 'PURCHASE')!;
    expect(metalMax85.taxVariancePaise).toBe(100n); // +₹1

    const shivamBill = allBills.find(b => b.partyId === shivam.id)!;
    expect(shivamBill.taxVariancePaise).toBe(-100n); // -₹1

    const anand4573 = allBills.find(b => b.billNumber === '26-27/4573')!;
    expect(anand4573.taxVariancePaise).toBe(-100n); // -₹1

    const swarnBill = allBills.find(b => b.partyId === partiesRepo.getByNormName('SWARNENTERPRISES')!.id)!;
    expect(swarnBill.taxVariancePaise).toBe(-7500n); // -₹75
    expect(swarnBill.splitFlags).toContain('SPLIT_FROM_ENTERED');
    expect(swarnBill.cgstPaise).toBe(33800n);
    expect(swarnBill.sgstPaise).toBe(33900n);
    expect(swarnBill.cgstPaise + swarnBill.sgstPaise).toBe(67700n);

    // Parity check for every bill: cgst + sgst + igst === tax_amount_paise and no negative tax
    for (const b of allBills) {
      expect(b.cgstPaise >= 0n).toBe(true);
      expect(b.sgstPaise >= 0n).toBe(true);
      expect(b.igstPaise >= 0n).toBe(true);
      expect(b.cessPaise >= 0n).toBe(true);
      expect(b.cgstPaise + b.sgstPaise + b.igstPaise + b.cessPaise).toBe(b.taxAmountPaise);
    }
  });

  it('Part Six: loading fixture a second time inserts nothing and reports 67 duplicates', () => {
    const firstSummary = loadJuly2026Fixture(db);
    expect(firstSummary.purchaseBillsLoaded).toBe(35);
    expect(firstSummary.saleBillsLoaded).toBe(31);

    const secondSummary = loadJuly2026Fixture(db);
    expect(secondSummary.purchaseBillsLoaded).toBe(0);
    expect(secondSummary.saleBillsLoaded).toBe(0);
    expect(secondSummary.duplicateErrorsCount).toBe(67);
  });

  it('Party Provenance: all 21 suppliers match july-2026-fixture.csv character for character and no fabricated rows exist', () => {
    loadJuly2026Fixture(db);

    const csvRows = parseFixtureCsv();
    const csvSuppliers = new Map<string, { gstin?: string; name: string }>();
    for (const r of csvRows) {
      if (r.direction === 'PURCHASE' && r.partyDisplayName) {
        csvSuppliers.set(r.partyDisplayName, { gstin: r.partyGstin, name: r.partyDisplayName });
      }
    }

    const dbParties = partiesRepo.list();
    expect(dbParties.length).toBe(21);

    // 1. No fabricated supplier names exist in DB
    const bannedNames = [
      'Goyal Fasteners',
      'Aggarwal Tools',
      'Bansal Hardware',
      'Krishna Steels',
      'Sharma Engineering',
      'Verma Industrial Stores',
    ];
    for (const banned of bannedNames) {
      expect(dbParties.some(p => p.displayName === banned)).toBe(false);
    }

    // 2. All 21 verified suppliers are present with exact names
    const realSuppliers = [
      '4S Solutions',
      'Anand Machinery Store',
      'Chand Company',
      'Durga Metals',
      'India Steel',
      'Jain Tool Center',
      'Jyoti Steel',
      'Kedarnath and Company',
      'Metal Max Industries',
      'Nav Bharat Electricals',
      'Omnipresent Engineers',
      'Prakash Machinery Store',
      'R.H. Engineering Works',
      'Rawal Machinery Store',
      'S.S.K. Engineering Works',
      'Sapna Steels and Alloys Pvt Ltd',
      'Shivam Enterprises',
      'Swarn Enterprises',
      'Taneja Traders',
      'Vanshika Steels (India)',
      'Vardhman Industrial Gases',
    ];
    for (const name of realSuppliers) {
      expect(dbParties.some(p => p.displayName === name)).toBe(true);
    }

    // 3. Every parties.gstin in the database appears in july-2026-fixture.csv
    for (const p of dbParties) {
      const csvMatch = csvSuppliers.get(p.displayName);
      expect(csvMatch).toBeDefined();
      expect(p.gstin).toBe(csvMatch?.gstin);
      expect(p.legalName).toBeNull(); // No invented legal_name
    }

    // 4. Exactly 4 parties carry gstin_verified = 0 with note
    const unverifiedParties = dbParties.filter(p => !p.gstinVerified);
    expect(unverifiedParties.length).toBe(4);
    const unverifiedNames = unverifiedParties.map(p => p.displayName).sort();
    expect(unverifiedNames).toEqual([
      '4S Solutions',
      'Chand Company',
      'Shivam Enterprises',
      'Vardhman Industrial Gases',
    ]);
    for (const p of unverifiedParties) {
      expect(p.notes).toBe('read from the handwritten register — confirm against the bill');
    }

    // 5. Exactly 17 parties carry gstin_verified = 1
    const verifiedParties = dbParties.filter(p => p.gstinVerified);
    expect(verifiedParties.length).toBe(17);

    // 6. Anti-fabrication guard: No GSTIN matches synthetic sequences ^09AAEC or ^09AAAF followed by 1234|3456|5678|7890|9012
    const syntheticPattern = /^09(?:AAEC|AAAF)(?:1234|3456|5678|7890|9012)/;
    for (const p of dbParties) {
      if (p.gstin) {
        expect(syntheticPattern.test(p.gstin)).toBe(false);
      }
    }
  });

  it('Party Provenance: provenance validator fails when a fabricated supplier row is inserted into database', () => {
    loadJuly2026Fixture(db);

    // Deliberately insert a fabricated supplier
    partiesRepo.create({
      displayName: 'Goyal Fasteners',
      gstin: '09AAAFG1234H1Z5',
      stateCode: '09',
      city: 'Ghaziabad',
      isSupplier: true,
      isCustomer: false,
    });

    const csvRows = parseFixtureCsv();
    const csvPartyNames = new Set(csvRows.filter(r => r.direction === 'PURCHASE').map(r => r.partyDisplayName));

    const validateProvenance = () => {
      const dbParties = partiesRepo.list();
      for (const p of dbParties) {
        if (!csvPartyNames.has(p.displayName)) {
          throw new Error(`FABRICATED_PARTY_DETECTED: Party "${p.displayName}" (GSTIN: ${p.gstin}) does not exist in source CSV!`);
        }
      }
    };

    expect(validateProvenance).toThrowError(/FABRICATED_PARTY_DETECTED: Party "Goyal Fasteners"/);
  });

  it('Migration 0006: deletes seeded parties with party-* prefix and leaves org_units untouched', () => {
    // Migration 0005 inserted parties with id 'party-*'
    // Migration 0006 deleted them
    const partiesWithPrefix = db.prepare("SELECT count(*) as count FROM parties WHERE id LIKE 'party-%'").get() as { count: number };
    expect(partiesWithPrefix.count).toBe(0);

    // org_units remain intact
    const orgUnits = orgUnitsRepo.list();
    expect(orgUnits.length).toBe(2);
    expect(orgUnits.some(u => u.shortName === 'Lucknow')).toBe(true);
    expect(orgUnits.some(u => u.shortName === 'Ghaziabad')).toBe(true);
  });

  it('Criterion 9: hard blocks duplicate purchase bill in the same financial year with existing bill details', () => {
    const period = periodsRepo.create({
      financialYear: '2026-27',
      year: 2026,
      month: 7,
      label: 'July 2026',
      status: 'OPEN',
      openedAt: '2026-07-01T00:00:00.000Z',
    });

    const party = partiesRepo.getByNormName('DURGAMETALS')!;

    const first = billsRepo.create(
      {
        direction: 'PURCHASE',
        periodId: period.id,
        partyId: party.id,
        billNumber: 'GST-1291/26-27',
        billDate: '2026-07-02',
        totalAmountPaise: paise(14154200n),
        taxAmountPaise: paise(2159100n),
        primaryRateBps: 1800n,
      },
      { roundingRule: 'HALF_DOWN' },
    );
    expect(first.ok).toBe(true);

    // Attempting same bill number in another month of same FY (e.g. late bill in September)
    const sepPeriod = periodsRepo.create({
      financialYear: '2026-27',
      year: 2026,
      month: 9,
      label: 'September 2026',
      status: 'OPEN',
      openedAt: '2026-09-01T00:00:00.000Z',
    });

    const duplicate = billsRepo.create(
      {
        direction: 'PURCHASE',
        periodId: sepPeriod.id,
        partyId: party.id,
        billNumber: 'GST 1291 26-27', // different spacing/punctuation normalizes identically
        billDate: '2026-07-02',
        totalAmountPaise: paise(14154200n),
        taxAmountPaise: paise(2159100n),
        primaryRateBps: 1800n,
      },
      { roundingRule: 'HALF_DOWN' },
    );

    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok && typeof duplicate.error === 'object') {
      expect(duplicate.error.code).toBe('DUPLICATE_BILL');
      expect(duplicate.error.existingBill.billNumber).toBe('GST-1291/26-27');
      expect(duplicate.error.existingBill.totalAmountPaise).toBe(paise(14154200n));
      expect(duplicate.error.existingBill.financialYear).toBe('2026-27');
    }
  });

  it('Criterion 10: allows the same bill number in a different financial year', () => {
    const jul26 = periodsRepo.create({
      financialYear: '2026-27',
      year: 2026,
      month: 7,
      label: 'July 2026',
      status: 'OPEN',
      openedAt: '2026-07-01T00:00:00.000Z',
    });

    const jul27 = periodsRepo.create({
      financialYear: '2027-28',
      year: 2027,
      month: 7,
      label: 'July 2027',
      status: 'OPEN',
      openedAt: '2027-07-01T00:00:00.000Z',
    });

    const party = partiesRepo.getByNormName('DURGAMETALS')!;

    const b1 = billsRepo.create(
      {
        direction: 'PURCHASE',
        periodId: jul26.id,
        partyId: party.id,
        billNumber: 'BILL-100',
        billDate: '2026-07-02',
        totalAmountPaise: paise(1180000n),
        taxAmountPaise: paise(180000n),
        primaryRateBps: 1800n,
      },
      { roundingRule: 'HALF_DOWN' },
    );
    expect(b1.ok).toBe(true);

    const b2 = billsRepo.create(
      {
        direction: 'PURCHASE',
        periodId: jul27.id,
        partyId: party.id,
        billNumber: 'BILL-100',
        billDate: '2027-07-02',
        totalAmountPaise: paise(1180000n),
        taxAmountPaise: paise(180000n),
        primaryRateBps: 1800n,
      },
      { roundingRule: 'HALF_DOWN' },
    );
    expect(b2.ok).toBe(true);
  });

  it('Criterion 11: Ghaziabad bill 63 and Lucknow bill 63 can coexist in the same financial year', () => {
    const period = periodsRepo.create({
      financialYear: '2026-27',
      year: 2026,
      month: 7,
      label: 'July 2026',
      status: 'OPEN',
      openedAt: '2026-07-01T00:00:00.000Z',
    });

    const lko = orgUnitsRepo.list().find(u => u.shortName === 'Lucknow')!;
    const gzb = orgUnitsRepo.list().find(u => u.shortName === 'Ghaziabad')!;

    const lkoBill = billsRepo.create(
      {
        direction: 'SALE',
        periodId: period.id,
        orgUnitId: lko.id,
        billNumber: '63',
        billDate: '2026-07-01',
        totalAmountPaise: paise(1180000n),
        taxAmountPaise: paise(180000n),
        primaryRateBps: 1800n,
      },
      { roundingRule: 'HALF_DOWN' },
    );
    expect(lkoBill.ok).toBe(true);

    const gzbBill = billsRepo.create(
      {
        direction: 'SALE',
        periodId: period.id,
        orgUnitId: gzb.id,
        billNumber: '63',
        billDate: '2026-07-01',
        totalAmountPaise: paise(23600000n),
        taxAmountPaise: paise(3600000n),
        primaryRateBps: 1800n,
      },
      { roundingRule: 'HALF_DOWN' },
    );
    expect(gzbBill.ok).toBe(true);
  });

  it('Criterion 12: attempting to insert negative sgst_paise directly via SQL is rejected by CHECK constraint', () => {
    const period = periodsRepo.create({
      financialYear: '2026-27',
      year: 2026,
      month: 7,
      label: 'July 2026',
      status: 'OPEN',
      openedAt: '2026-07-01T00:00:00.000Z',
    });
    const party = partiesRepo.getByNormName('DURGAMETALS')!;

    expect(() => {
      db.prepare(
        `
        INSERT INTO bills (
          id, direction, period_id, party_id, bill_number, bill_number_norm,
          bill_date, financial_year, place_of_supply_state_code, supply_type,
          total_amount_paise, tax_amount_paise, taxable_amount_paise,
          cgst_paise, sgst_paise, igst_paise, cess_paise, status, created_at, updated_at
        ) VALUES (
          'test-neg-sgst', 'PURCHASE', ?, ?, 'INV-1', 'INV1',
          '2026-07-01', '2026-27', '09', 'INTRA',
          10000, 1800, 8200,
          1900, -100, 0, 0, 'ACTIVE', '2026-07-01', '2026-07-01'
        )
      `,
      ).run(period.id, party.id);
    }).toThrow(/CHECK constraint failed/);
  });

  it('Criterion 13: attempting to insert a bill where cgst + sgst + igst != tax_amount_paise is rejected by CHECK constraint', () => {
    const period = periodsRepo.create({
      financialYear: '2026-27',
      year: 2026,
      month: 7,
      label: 'July 2026',
      status: 'OPEN',
      openedAt: '2026-07-01T00:00:00.000Z',
    });
    const party = partiesRepo.getByNormName('DURGAMETALS')!;

    expect(() => {
      db.prepare(
        `
        INSERT INTO bills (
          id, direction, period_id, party_id, bill_number, bill_number_norm,
          bill_date, financial_year, place_of_supply_state_code, supply_type,
          total_amount_paise, tax_amount_paise, taxable_amount_paise,
          cgst_paise, sgst_paise, igst_paise, cess_paise, status, created_at, updated_at
        ) VALUES (
          'test-tax-mismatch', 'PURCHASE', ?, ?, 'INV-2', 'INV2',
          '2026-07-01', '2026-27', '09', 'INTRA',
          11800, 1800, 10000,
          800, 800, 0, 0, 'ACTIVE', '2026-07-01', '2026-07-01'
        )
      `,
      ).run(period.id, party.id);
    }).toThrow(/CHECK constraint failed/);
  });

  it('Criterion 14: findProbableDuplicates flags a same-supplier same-amount bill 5 days apart without blocking', () => {
    const period = periodsRepo.create({
      financialYear: '2026-27',
      year: 2026,
      month: 7,
      label: 'July 2026',
      status: 'OPEN',
      openedAt: '2026-07-01T00:00:00.000Z',
    });
    const party = partiesRepo.getByNormName('DURGAMETALS')!;

    // Insert bill 70 on July 8
    const b1 = billsRepo.create(
      {
        direction: 'PURCHASE',
        periodId: period.id,
        partyId: party.id,
        billNumber: 'INV-101',
        billDate: '2026-07-08',
        totalAmountPaise: paise(18880000n),
        taxAmountPaise: paise(2880000n),
        primaryRateBps: 1800n,
      },
      { roundingRule: 'HALF_DOWN' },
    );
    expect(b1.ok).toBe(true);

    // Soft duplicate candidate on July 13 (5 days later)
    const probables = billsRepo.findProbableDuplicates({
      partyId: party.id,
      totalAmountPaise: paise(18880000n),
      billDate: '2026-07-13',
      billNumber: 'INV-102',
    });

    expect(probables.length).toBe(1);
    expect(probables[0]?.billNumber).toBe('INV-101');
    expect(probables[0]?.daysDifference).toBe(5);

    // Genuine repeats can still be created
    const b2 = billsRepo.create(
      {
        direction: 'PURCHASE',
        periodId: period.id,
        partyId: party.id,
        billNumber: 'INV-102',
        billDate: '2026-07-13',
        totalAmountPaise: paise(18880000n),
        taxAmountPaise: paise(2880000n),
        primaryRateBps: 1800n,
      },
      { roundingRule: 'HALF_DOWN' },
    );
    expect(b2.ok).toBe(true);
  });

  it('Criterion 15: every bill write produces exactly one audit_log row in the same transaction', () => {
    const period = periodsRepo.create({
      financialYear: '2026-27',
      year: 2026,
      month: 7,
      label: 'July 2026',
      status: 'OPEN',
      openedAt: '2026-07-01T00:00:00.000Z',
    });
    const party = partiesRepo.getByNormName('DURGAMETALS')!;

    const beforeAuditCount = (db.prepare("SELECT count(*) as count FROM audit_log WHERE entity_table = 'bills'").get() as { count: number }).count;

    const res = billsRepo.create(
      {
        direction: 'PURCHASE',
        periodId: period.id,
        partyId: party.id,
        billNumber: 'AUDIT-TEST-1',
        billDate: '2026-07-10',
        totalAmountPaise: paise(1180000n),
        taxAmountPaise: paise(180000n),
        primaryRateBps: 1800n,
      },
      { roundingRule: 'HALF_DOWN' },
    );
    expect(res.ok).toBe(true);

    const afterAuditCount = (db.prepare("SELECT count(*) as count FROM audit_log WHERE entity_table = 'bills'").get() as { count: number }).count;
    expect(afterAuditCount).toBe(beforeAuditCount + 1);

    const auditEntry = db.prepare('SELECT * FROM audit_log WHERE entity_id = ?').get((res as { value: { id: string } }).value.id) as {
      action: string;
      entity_table: string;
      after_json: string;
    };
    expect(auditEntry.action).toBe('CREATE');
    expect(auditEntry.entity_table).toBe('bills');
    expect(auditEntry.after_json).toContain('AUDIT-TEST-1');
  });

  it('Housekeeping H1: rounding.rule defaults to HALF_DOWN and remains HALF_DOWN in database', () => {
    expect(settingsRepo.getRoundingRule()).toBe('HALF_DOWN');
  });
});
