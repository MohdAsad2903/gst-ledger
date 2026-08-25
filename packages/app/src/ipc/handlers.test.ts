import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';
import { openDatabase, runMigrations, SettingsRepository } from '@gst/data';
import { handleCalcDemo } from './handlers.js';

describe('IPC Handlers & Acceptance Criteria (Part 1E)', () => {
  let tempDir: string;
  let dbPath: string;
  let db: Database.Database;
  let settingsRepo: SettingsRepository;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gst-ipc-test-'));
    dbPath = path.join(tempDir, 'test-ledger.sqlite');
    db = openDatabase(dbPath);
    await runMigrations(db);
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

  it('Acceptance Criterion 5: Total 141542, GST 21591, 18%, State 09 -> Bill Amount ₹1,19,951, CGST ₹10,796, SGST ₹10,795', () => {
    const res = handleCalcDemo(
      {
        totalAmount: '141542',
        gstAmount: '21591',
        rateBps: 1800,
        counterpartyStateCode: '09',
      },
      settingsRepo,
    );

    expect(res.taxableAmount).toBe('1,19,951.00');
    expect(res.enteredTax).toBe('21,591.00');
    expect(res.expectedTax).toBe('21,591.00');
    expect(res.variance).toBe('0.00');
    expect(res.varianceSeverity).toBe('NONE');
    expect(res.supplyType).toBe('INTRA');
    expect(res.split?.cgst).toBe('10,796.00');
    expect(res.split?.sgst).toBe('10,795.00');
    expect(res.split?.igst).toBe('0.00');
    expect(res.roundingRuleUsed).toBe('HALF_DOWN');
  });

  it('Acceptance Criterion 6: Total 320373, GST 48870, 18%, State 07 -> Bill Amount ₹2,71,503, expected ₹48,871, variance -₹1 (INFO), IGST ₹48,870', () => {
    const res = handleCalcDemo(
      {
        totalAmount: '320373',
        gstAmount: '48870',
        rateBps: 1800,
        counterpartyStateCode: '07',
      },
      settingsRepo,
    );

    expect(res.taxableAmount).toBe('2,71,503.00');
    expect(res.enteredTax).toBe('48,870.00');
    expect(res.expectedTax).toBe('48,871.00');
    expect(res.variance).toBe('-1.00');
    expect(res.varianceSeverity).toBe('INFO');
    expect(res.supplyType).toBe('INTER');
    expect(res.split?.igst).toBe('48,870.00');
    expect(res.split?.cgst).toBe('0.00');
    expect(res.split?.sgst).toBe('0.00');
  });

  it('Acceptance Criterion 7: Mixed-rate Total 4853, GST 677, 18% -> variance -₹75 (WARN), RATE_NOT_RECOGNISED 16.2%', () => {
    const res = handleCalcDemo(
      {
        totalAmount: '4853',
        gstAmount: '677',
        rateBps: 1800,
        counterpartyStateCode: '09',
      },
      settingsRepo,
    );

    expect(res.taxableAmount).toBe('4,176.00');
    expect(res.enteredTax).toBe('677.00');
    expect(res.expectedTax).toBe('752.00');
    expect(res.variance).toBe('-75.00');
    expect(res.varianceSeverity).toBe('WARN');

    const rateWarning = res.issues.find(i => i.code === 'RATE_NOT_RECOGNISED');
    expect(rateWarning).toBeDefined();
    expect(rateWarning?.message).toContain('16.2%');
  });

  it('Acceptance Criterion 8: Switching rounding.rule to HALF_UP updates calculation immediately without app restart', () => {
    // 1. Initial run under HALF_DOWN with exact half case
    settingsRepo.setRoundingRule('HALF_DOWN');
    const resDown = handleCalcDemo(
      {
        totalAmount: '11800',
        gstAmount: '1800',
        rateBps: 1800,
        counterpartyStateCode: '09',
      },
      settingsRepo,
    );
    expect(resDown.roundingRuleUsed).toBe('HALF_DOWN');

    // 2. Change rule in DB to HALF_UP
    settingsRepo.setRoundingRule('HALF_UP', 'Switching live to Section 170');

    // 3. Next call immediately reflects HALF_UP without caching or restarting
    const resUp = handleCalcDemo(
      {
        totalAmount: '11800',
        gstAmount: '1800',
        rateBps: 1800,
        counterpartyStateCode: '09',
      },
      settingsRepo,
    );
    expect(resUp.roundingRuleUsed).toBe('HALF_UP');

    // Verify audit log entry was created for the setting change
    const auditRows = db
      .prepare("SELECT * FROM audit_log WHERE entity_table = 'app_settings' AND entity_id = 'rounding.rule'")
      .all() as Array<{ action: string; before_json: string; after_json: string }>;
    expect(auditRows.length).toBeGreaterThan(0);
    expect(auditRows[auditRows.length - 1]?.action).toBe('SETTING_CHANGE');
    expect(auditRows[auditRows.length - 1]?.after_json).toBe('"HALF_UP"');
  });

  it('Proves no monetary values cross IPC as JavaScript numbers', () => {
    const res = handleCalcDemo(
      {
        totalAmount: '141542',
        gstAmount: '21591',
        rateBps: 1800,
        counterpartyStateCode: '09',
      },
      settingsRepo,
    );

    const serialized = JSON.stringify(res);
    const parsed = JSON.parse(serialized);

    // Verify all monetary fields are strings or null, never numbers
    expect(typeof parsed.taxableAmount).toBe('string');
    expect(typeof parsed.enteredTax).toBe('string');
    expect(typeof parsed.expectedTax).toBe('string');
    expect(typeof parsed.variance).toBe('string');
    expect(typeof parsed.split.cgst).toBe('string');
    expect(typeof parsed.split.sgst).toBe('string');
    expect(typeof parsed.split.igst).toBe('string');

    // Ensure none of the values are raw unquoted numeric types
    expect(parsed.taxableAmount).toBe('1,19,951.00');
    expect(parsed.expectedTax).toBe('21,591.00');
  });
});
