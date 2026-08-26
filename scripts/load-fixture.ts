import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import {
  openDatabase,
  runMigrations,
  OrgUnitsRepository,
  PartiesRepository,
  PeriodsRepository,
  BillsRepository,
  SettingsRepository,
  normalizePartyName,
} from '../packages/data/src/index.js';
import { paise } from '../packages/core/src/index.js';
import {
  JULY_2026_OPENING_CREDIT_PAISE,
} from '../packages/data/src/fixtures/july-2026.js';

export interface FixtureLoadSummary {
  purchaseBillsLoaded: number;
  suppliersCreated: number;
  saleBillsLoaded: number;
  cancelledSaleBills: number;
  outputGstSalesPaise: bigint;
  inputGstPurchasesPaise: bigint;
  openingCreditPaise: bigint;
  netPayablePaise: bigint;
  duplicateErrorsCount: number;
}

export interface CsvFixtureRow {
  direction: 'PURCHASE' | 'SALE';
  periodYear: number;
  periodMonth: number;
  branchShortName?: string;
  partyDisplayName?: string;
  partyGstin?: string;
  partyStateCode?: string;
  partyCity?: string;
  billNumber: string;
  billDate: string;
  totalAmountRupees: number;
  taxAmountRupees: number;
  rateBps?: number;
  isCancelled?: boolean;
  notes?: string;
}

export function parseFixtureCsv(csvPath?: string): CsvFixtureRow[] {
  const filePath = csvPath ?? path.resolve(process.cwd(), 'packages/data/fixtures/july-2026-fixture.csv');
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split(/\r?\n/);
  const rows: CsvFixtureRow[] = [];

  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    const parts = line.split(',');
    rows.push({
      direction: parts[0] as 'PURCHASE' | 'SALE',
      periodYear: parseInt(parts[1]!, 10),
      periodMonth: parseInt(parts[2]!, 10),
      branchShortName: parts[3] || undefined,
      partyDisplayName: parts[4] || undefined,
      partyGstin: parts[5] || undefined,
      partyStateCode: parts[6] || undefined,
      partyCity: parts[7] || undefined,
      billNumber: parts[8]!,
      billDate: parts[9]!,
      totalAmountRupees: parseInt(parts[10]!, 10),
      taxAmountRupees: parseInt(parts[11]!, 10),
      rateBps: parts[12] ? parseInt(parts[12]!, 10) : undefined,
      isCancelled: parts[13] === '1',
      notes: parts.slice(14).join(',') || undefined,
    });
  }

  return rows;
}

export function loadJuly2026Fixture(dbOrPath: Database.Database | string, csvPath?: string): FixtureLoadSummary {
  const isCustomDb = typeof dbOrPath !== 'string';
  const db = isCustomDb ? dbOrPath : openDatabase(dbOrPath);
  if (!isCustomDb) {
    runMigrations(db);
  }

  try {
    const orgUnitsRepo = new OrgUnitsRepository(db);
    const partiesRepo = new PartiesRepository(db);
    const periodsRepo = new PeriodsRepository(db);
    const billsRepo = new BillsRepository(db);
    const settingsRepo = new SettingsRepository(db);
    const roundingRule = settingsRepo.getRoundingRule();

    // 1. Ensure Period (July 2026) exists
    let period = periodsRepo.getByYearMonth(2026, 7);
    if (!period) {
      period = periodsRepo.create({
        financialYear: '2026-27',
        year: 2026,
        month: 7,
        label: 'July 2026',
        status: 'OPEN',
        openedAt: '2026-07-01T00:00:00.000Z',
      });
    }

    // 2. Set Opening Credit
    periodsRepo.setOpeningCredit(
      period.id,
      JULY_2026_OPENING_CREDIT_PAISE,
      'Extra paid GST upto 30/06/2026',
    );

    // 3. Load rows from CSV
    const rows = parseFixtureCsv(csvPath);

    // 4. Ensure branches
    const orgUnits = orgUnitsRepo.list();
    const lkoBranch = orgUnits.find(u => u.shortName === 'Lucknow');
    const gzbBranch = orgUnits.find(u => u.shortName === 'Ghaziabad');

    // 5. Seed parties from CSV rows (the ONLY source of truth)
    const unverifiedPartyNorms = new Set([
      'SHIVAMENTERPRISES',
      'VARDHMANINDUSTRIALGASES',
      'CHANDCOMPANY',
      '4SSOLUTIONS',
    ]);

    for (const row of rows) {
      if (row.direction === 'PURCHASE' && row.partyDisplayName) {
        const normName = normalizePartyName(row.partyDisplayName);
        const existing = partiesRepo.getByNormName(normName);
        if (!existing) {
          const isUnverified = unverifiedPartyNorms.has(normName);
          partiesRepo.create({
            displayName: row.partyDisplayName,
            gstin: row.partyGstin ?? null,
            stateCode: row.partyStateCode ?? '09',
            city: row.partyCity ?? null,
            isSupplier: true,
            isCustomer: false,
            gstinVerified: !isUnverified,
            notes: isUnverified ? 'read from the handwritten register — confirm against the bill' : undefined,
          });
        }
      }
    }

    const allParties = partiesRepo.list();
    const partyMap = new Map<string, string>();
    for (const p of allParties) {
      partyMap.set(p.displayNameNorm, p.id);
    }

    let purchaseBillsLoaded = 0;
    let saleBillsLoaded = 0;
    let cancelledSaleBills = 0;
    let duplicateErrorsCount = 0;

    let outputGstSalesPaise = 0n;
    let inputGstPurchasesPaise = 0n;

    // 6. Process all rows
    for (const row of rows) {
      if (row.direction === 'PURCHASE') {
        const normName = normalizePartyName(row.partyDisplayName!);
        const partyId = partyMap.get(normName);
        if (!partyId) {
          throw new Error(`Supplier not found for: ${row.partyDisplayName}`);
        }

        const res = billsRepo.create(
          {
            direction: 'PURCHASE',
            periodId: period.id,
            partyId,
            billNumber: row.billNumber,
            billDate: row.billDate,
            totalAmountPaise: paise(BigInt(row.totalAmountRupees) * 100n),
            taxAmountPaise: paise(BigInt(row.taxAmountRupees) * 100n),
            primaryRateBps: row.rateBps ? BigInt(row.rateBps) : null,
          },
          { roundingRule, ourStateCode: '09' },
        );

        if (res.ok) {
          purchaseBillsLoaded++;
          inputGstPurchasesPaise += BigInt(res.value.taxAmountPaise);
        } else {
          duplicateErrorsCount++;
        }
      } else if (row.direction === 'SALE') {
        const branch = row.branchShortName === 'Lucknow' ? lkoBranch : gzbBranch;
        if (!branch) {
          throw new Error(`Branch not found for: ${row.branchShortName}`);
        }

        if (row.isCancelled) {
          const res = billsRepo.create(
            {
              direction: 'SALE',
              periodId: period.id,
              orgUnitId: branch.id,
              billNumber: row.billNumber,
              billDate: row.billDate,
              totalAmountPaise: paise(0n),
              taxAmountPaise: paise(0n),
              status: 'CANCELLED',
              cancellationReason: row.notes ?? 'Cancelled invoice number retained',
            },
            { roundingRule, ourStateCode: '09' },
          );

          if (res.ok) {
            cancelledSaleBills++;
          } else {
            duplicateErrorsCount++;
          }
        } else {
          const res = billsRepo.create(
            {
              direction: 'SALE',
              periodId: period.id,
              orgUnitId: branch.id,
              billNumber: row.billNumber,
              billDate: row.billDate,
              totalAmountPaise: paise(BigInt(row.totalAmountRupees) * 100n),
              taxAmountPaise: paise(BigInt(row.taxAmountRupees) * 100n),
              primaryRateBps: row.rateBps ? BigInt(row.rateBps) : null,
            },
            { roundingRule, ourStateCode: '09' },
          );

          if (res.ok) {
            saleBillsLoaded++;
            outputGstSalesPaise += BigInt(res.value.taxAmountPaise);
          } else {
            duplicateErrorsCount++;
          }
        }
      }
    }

    const openingCredit = JULY_2026_OPENING_CREDIT_PAISE;
    const netPayablePaise = outputGstSalesPaise - (inputGstPurchasesPaise + BigInt(openingCredit));

    return {
      purchaseBillsLoaded,
      suppliersCreated: allParties.length,
      saleBillsLoaded,
      cancelledSaleBills,
      outputGstSalesPaise,
      inputGstPurchasesPaise,
      openingCreditPaise: BigInt(openingCredit),
      netPayablePaise,
      duplicateErrorsCount,
    };
  } finally {
    if (!isCustomDb) {
      try {
        db.close();
      } catch {
        // ignore
      }
    }
  }
}

if (process.argv[1] && (process.argv[1].endsWith('load-fixture.ts') || process.argv[1].endsWith('load-fixture.js'))) {
  const dbPath = path.resolve('test-fixture.sqlite');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

  const summary = loadJuly2026Fixture(dbPath);
  console.log('=== JULY 2026 FIXTURE LOAD SUMMARY ===');
  console.log(`Purchase bills loaded:  ${summary.purchaseBillsLoaded} (Expected: 35)`);
  console.log(`Suppliers active:       ${summary.suppliersCreated} (Expected: 21)`);
  console.log(`Sale bills (active):    ${summary.saleBillsLoaded} (Expected: 31)`);
  console.log(`Cancelled sale bills:   ${summary.cancelledSaleBills} (Expected: 1)`);
  console.log(`Output GST (sales):     ₹${Number(summary.outputGstSalesPaise / 100n).toLocaleString('en-IN')} (Expected: ₹13,30,677)`);
  console.log(`Input GST (purchases):  ₹${Number(summary.inputGstPurchasesPaise / 100n).toLocaleString('en-IN')} (Expected: ₹4,78,536)`);
  console.log(`Opening credit:         ₹${Number(summary.openingCreditPaise / 100n).toLocaleString('en-IN')} (Expected: ₹1,26,028)`);
  console.log(`Net payable:            ₹${Number(summary.netPayablePaise / 100n).toLocaleString('en-IN')} (Expected: ₹7,26,113)`);
  console.log('======================================');

  // Second load to test duplicate blocking
  console.log('Attempting second fixture load into same database...');
  const secondSummary = loadJuly2026Fixture(dbPath);
  console.log(`Second load inserts: 0 (Purchases: ${secondSummary.purchaseBillsLoaded}, Sales: ${secondSummary.saleBillsLoaded})`);
  console.log(`Duplicate errors reported: ${secondSummary.duplicateErrorsCount} (Expected: 67)`);
  console.log('======================================');
}
