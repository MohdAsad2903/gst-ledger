import path from 'node:path';
import Database from 'better-sqlite3';
import { loadJuly2026Fixture } from './load-fixture.js';

const realDbPath = 'C:\\Users\\Ashraf Imam\\AppData\\Roaming\\GST Ledger\\gst-ledger.sqlite';

console.log('1. Loading July 2026 Fixture into real userData database...');
const summary = loadJuly2026Fixture(realDbPath, undefined, true);

console.log('\n2. Re-reading real userData database via direct SQL queries...');
const db = new Database(realDbPath);

const purchaseBills = db.prepare("SELECT count(*) as count FROM bills WHERE direction = 'PURCHASE'").get() as { count: number };
const activeSaleBills = db.prepare("SELECT count(*) as count FROM bills WHERE direction = 'SALE' AND status = 'ACTIVE'").get() as { count: number };
const cancelledSaleBills = db.prepare("SELECT count(*) as count FROM bills WHERE direction = 'SALE' AND status = 'CANCELLED'").get() as { count: number };
const totalParties = db.prepare("SELECT count(*) as count FROM parties").get() as { count: number };

const salesGstPaise = db.prepare("SELECT SUM(tax_amount_paise) as sum FROM bills WHERE direction = 'SALE' AND status = 'ACTIVE'").get() as { sum: bigint };
const purchaseGstPaise = db.prepare("SELECT SUM(tax_amount_paise) as sum FROM bills WHERE direction = 'PURCHASE'").get() as { sum: bigint };
const openingCreditPaise = db.prepare("SELECT opening_credit_paise FROM period_opening_credits").get() as { opening_credit_paise: bigint };

const salesGst = BigInt(salesGstPaise.sum || 0);
const purchaseGst = BigInt(purchaseGstPaise.sum || 0);
const openingCredit = BigInt(openingCreditPaise.opening_credit_paise || 0);
const netPayable = salesGst - (purchaseGst + openingCredit);

console.log('=== REAL USERDATA DATABASE RE-READ RESULTS ===');
console.log(`Database Path:           ${realDbPath}`);
console.log(`Total Purchase Bills:    ${purchaseBills.count}`);
console.log(`Active Sale Bills:       ${activeSaleBills.count}`);
console.log(`Cancelled Sale Bills:    ${cancelledSaleBills.count}`);
console.log(`Parties in Master:       ${totalParties.count}`);
console.log(`Output GST (sales):     ₹${(Number(salesGst) / 100).toLocaleString('en-IN')}`);
console.log(`Input GST (purchases):  ₹${(Number(purchaseGst) / 100).toLocaleString('en-IN')}`);
console.log(`Opening Credit:         ₹${(Number(openingCredit) / 100).toLocaleString('en-IN')}`);
console.log(`Net Payable GST:        ₹${(Number(netPayable) / 100).toLocaleString('en-IN')}`);
console.log('=============================================');

db.close();
