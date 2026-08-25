import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { paise, roundToRupee } from '@gst/core';
import { openDatabase } from '../db/connection.js';
import { runMigrations } from '../migrations/runner.js';
import { SettingsRepository } from './settings.repository.js';

describe('SettingsRepository & Rounding Rule Configuration', () => {
  let tempDir: string;
  let tempDbPath: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gst-settings-test-'));
    tempDbPath = path.join(tempDir, 'test-ledger.sqlite');
    const db = openDatabase(tempDbPath);
    await runMigrations(db);
    db.close();
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('reads all eight seeded settings with exact types', () => {
    const db = openDatabase(tempDbPath);
    try {
      const repo = new SettingsRepository(db);

      expect(repo.getRoundingRule()).toBe('HALF_DOWN');

      const thresholds = repo.getVarianceThresholds();
      expect(thresholds.infoPaise).toBe(paise(200n));
      expect(thresholds.warnPaise).toBe(paise(10000n));

      expect(repo.getDefaultStateCode()).toBe('09');
      expect(repo.getBackupRetainCount()).toBe(30);
      expect(repo.getBackupOnAppClose()).toBe(true);
      expect(repo.getDateFormat()).toBe('DD/MM/YYYY');
      expect(repo.getLocale()).toBe('en-IN');
    } finally {
      db.close();
    }
  });

  it('proves Acceptance Criterion 9: changing rounding.rule to HALF_UP turns ₹123.50 into ₹124 with zero code changes', () => {
    const db = openDatabase(tempDbPath);
    try {
      const repo = new SettingsRepository(db);

      // Initial state: HALF_DOWN
      const initialRule = repo.getRoundingRule();
      expect(initialRule).toBe('HALF_DOWN');
      const roundedDown = roundToRupee(paise(12350n), initialRule);
      expect(roundedDown).toBe(paise(12300n)); // ₹123.00

      // Update setting in database to HALF_UP
      repo.setRoundingRule('HALF_UP', 'Testing Section 170 compliance');

      // Read back via typed getter
      const updatedRule = repo.getRoundingRule();
      expect(updatedRule).toBe('HALF_UP');

      // Pass directly to core roundToRupee
      const roundedUp = roundToRupee(paise(12350n), updatedRule);
      expect(roundedUp).toBe(paise(12400n)); // ₹124.00
    } finally {
      db.close();
    }
  });

  it('creates an audit log entry on setting write with before and after state', () => {
    const db = openDatabase(tempDbPath);
    try {
      const repo = new SettingsRepository(db);
      repo.set('backup.retainCount', 45, 'Increasing retention period');

      const auditRows = db
        .prepare(
          "SELECT * FROM audit_log WHERE entity_table = 'app_settings' AND entity_id = 'backup.retainCount'",
        )
        .all() as Array<{
        action: string;
        before_json: string;
        after_json: string;
        reason: string;
      }>;

      expect(auditRows.length).toBe(1);
      expect(auditRows[0]?.action).toBe('SETTING_CHANGE');
      expect(auditRows[0]?.before_json).toBe('30');
      expect(auditRows[0]?.after_json).toBe('45');
      expect(auditRows[0]?.reason).toBe('Increasing retention period');
    } finally {
      db.close();
    }
  });

  it('returns all settings as a key-value record map', () => {
    const db = openDatabase(tempDbPath);
    try {
      const repo = new SettingsRepository(db);
      const all = repo.getAllSettings();
      expect(all['rounding.rule']).toBe('HALF_DOWN');
      expect(all['org.defaultStateCode']).toBe('09');
      expect(all['backup.retainCount']).toBe(30);
    } finally {
      db.close();
    }
  });
});
