import { describe, it, expect } from 'vitest';
import path from 'node:path';
import Database from 'better-sqlite3';
import { loadJuly2026Fixture } from '../../../../scripts/load-fixture.js';

describe('Real UserData Database Loader & Verification', () => {
  it('loads July 2026 fixture into real app userData database and re-reads all bill counts and financial totals', () => {
    const appDataPath = process.env.APPDATA || 'C:\\Users\\Ashraf Imam\\AppData\\Roaming';
    const realDbPath = path.join(appDataPath, 'GST Ledger', 'gst-ledger.sqlite');

    // 1. Load fixture into real database
    const summary = loadJuly2026Fixture(realDbPath, undefined, true);
    expect(summary.purchaseBillsLoaded).toBe(35);

    // 2. Re-read real database directly via raw SQL
    const db = new Database(realDbPath);

    const purchaseBills = db.prepare("SELECT count(*) as count FROM bills WHERE direction = 'PURCHASE'").get() as { count: number };
    const activeSaleBills = db.prepare("SELECT count(*) as count FROM bills WHERE direction = 'SALE' AND status = 'ACTIVE'").get() as { count: number };
    const cancelledSaleBills = db.prepare("SELECT count(*) as count FROM bills WHERE direction = 'SALE' AND status = 'CANCELLED'").get() as { count: number };
    const totalParties = db.prepare("SELECT count(*) as count FROM parties").get() as { count: number };

    const salesGstRow = db.prepare("SELECT SUM(tax_amount_paise) as sum FROM bills WHERE direction = 'SALE' AND status = 'ACTIVE'").get() as { sum: number };
    const purchaseGstRow = db.prepare("SELECT SUM(tax_amount_paise) as sum FROM bills WHERE direction = 'PURCHASE'").get() as { sum: number };
    const openingCreditRow = db.prepare("SELECT amount_paise FROM period_opening_credits").get() as { amount_paise: number };

    const salesGst = BigInt(salesGstRow.sum || 0);
    const purchaseGst = BigInt(purchaseGstRow.sum || 0);
    const openingCredit = BigInt(openingCreditRow.amount_paise || 0);
    const netPayable = salesGst - (purchaseGst + openingCredit);

    console.log('\n=== REAL USERDATA DATABASE RE-READ RESULTS ===');
    console.log(`Database Path:           ${realDbPath}`);
    console.log(`Purchase Bills:          ${purchaseBills.count} (Expected: 35)`);
    console.log(`Active Sale Bills:       ${activeSaleBills.count} (Expected: 31)`);
    console.log(`Cancelled Sale Bills:    ${cancelledSaleBills.count} (Expected: 1)`);
    console.log(`Parties in Master:       ${totalParties.count} (Expected: 21)`);
    console.log(`Output GST (sales):     ₹${(Number(salesGst) / 100).toLocaleString('en-IN')} (Expected: ₹13,30,677)`);
    console.log(`Input GST (purchases):  ₹${(Number(purchaseGst) / 100).toLocaleString('en-IN')} (Expected: ₹4,78,536)`);
    console.log(`Opening Credit:         ₹${(Number(openingCredit) / 100).toLocaleString('en-IN')} (Expected: ₹1,26,028)`);
    console.log(`Net Payable GST:        ₹${(Number(netPayable) / 100).toLocaleString('en-IN')} (Expected: ₹7,26,113)`);
    console.log('=============================================\n');

    db.close();

    expect(purchaseBills.count).toBe(35);
    expect(activeSaleBills.count).toBe(31);
    expect(cancelledSaleBills.count).toBe(1);
    expect(totalParties.count).toBe(21);
    expect(salesGst).toBe(133067700n);
    expect(purchaseGst).toBe(47853600n);
    expect(openingCredit).toBe(12602800n);
    expect(netPayable).toBe(72611300n);
  });
});
