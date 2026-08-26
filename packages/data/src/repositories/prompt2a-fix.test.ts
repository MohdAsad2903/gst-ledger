import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type Database from 'better-sqlite3';
import {
  openDatabase,
  runMigrations,
  PartiesRepository,
} from '../index.js';
import { loadJuly2026Fixture, parseFixtureCsv } from '../../../../scripts/load-fixture.js';

describe('PROMPT 2A-FIX · Full Verification Deliverables', () => {
  let tempDir: string;
  let tempDbPath: string;
  let db: Database.Database;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gst-fix-test-'));
    tempDbPath = path.join(tempDir, 'fix.sqlite');
    db = openDatabase(tempDbPath);
    runMigrations(db);
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

  it('verifies full reconciliation and verbatim SQL query of all 21 suppliers', () => {
    const summary = loadJuly2026Fixture(db);

    console.log('=== VERIFIED FRESH JULY 2026 RECONCILIATION ===');
    console.log(`Purchase bills loaded:  ${summary.purchaseBillsLoaded} (Expected: 35)`);
    console.log(`Suppliers active:       ${summary.suppliersCreated} (Expected: 21)`);
    console.log(`Sale bills (active):    ${summary.saleBillsLoaded} (Expected: 31)`);
    console.log(`Cancelled sale bills:   ${summary.cancelledSaleBills} (Expected: 1)`);
    console.log(`Output GST (sales):     ₹${Number(summary.outputGstSalesPaise / 100n).toLocaleString('en-IN')}`);
    console.log(`Input GST (purchases):  ₹${Number(summary.inputGstPurchasesPaise / 100n).toLocaleString('en-IN')}`);
    console.log(`Opening credit:         ₹${Number(summary.openingCreditPaise / 100n).toLocaleString('en-IN')}`);
    console.log(`Net payable:            ₹${Number(summary.netPayablePaise / 100n).toLocaleString('en-IN')}`);
    console.log('==============================================');

    expect(summary.purchaseBillsLoaded).toBe(35);
    expect(summary.suppliersCreated).toBe(21);
    expect(summary.saleBillsLoaded).toBe(31);
    expect(summary.cancelledSaleBills).toBe(1);
    expect(summary.outputGstSalesPaise).toBe(133067700n);
    expect(summary.inputGstPurchasesPaise).toBe(47853600n);
    expect(summary.openingCreditPaise).toBe(12602800n);
    expect(summary.netPayablePaise).toBe(72611300n);

    // Second load duplicate check
    const secondSummary = loadJuly2026Fixture(db);
    expect(secondSummary.purchaseBillsLoaded).toBe(0);
    expect(secondSummary.saleBillsLoaded).toBe(0);
    expect(secondSummary.duplicateErrorsCount).toBe(67);

    // Verbatim SQL query of all 21 parties
    const rows = db.prepare('SELECT display_name, gstin, gstin_verified FROM parties ORDER BY display_name').all() as Array<{
      display_name: string;
      gstin: string;
      gstin_verified: number;
    }>;

    console.log('\n=== SELECT display_name, gstin, gstin_verified FROM parties ORDER BY display_name ===');
    console.table(rows);
    console.log('===================================================================================');

    expect(rows.length).toBe(21);
  });

  it('demonstrates hard failure on deliberate fabricated supplier row', () => {
    loadJuly2026Fixture(db);
    const partiesRepo = new PartiesRepository(db);

    // Insert deliberate fabricated supplier
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

    const checkProvenance = () => {
      const allDbParties = partiesRepo.list();
      for (const p of allDbParties) {
        if (!csvPartyNames.has(p.displayName)) {
          throw new Error(`[PROVENANCE_VIOLATION] Party "${p.displayName}" (GSTIN: ${p.gstin}) is FABRICATED and does not exist in july-2026-fixture.csv!`);
        }
      }
    };

    expect(checkProvenance).toThrowError(/\[PROVENANCE_VIOLATION\] Party "Goyal Fasteners"/);
  });
});
