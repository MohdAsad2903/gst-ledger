import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDatabase } from '../db/connection.js';
import { runMigrations } from '../migrations/runner.js';
import { withAudit } from './audit.js';

describe('Audit Log & Append-Only Triggers', () => {
  let tempDir: string;
  let tempDbPath: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gst-audit-test-'));
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

  it('allows INSERT into audit_log', () => {
    const db = openDatabase(tempDbPath);
    try {
      db.prepare(
        `
        INSERT INTO audit_log (id, entity_table, entity_id, action, before_json, after_json, reason, actor, created_at)
        VALUES ('test-audit-1', 'app_settings', 'rounding.rule', 'SETTING_CHANGE', null, '"HALF_UP"', 'audit test', 'local', '2026-08-25T12:00:00.000Z')
      `,
      ).run();

      const row = db
        .prepare('SELECT id, entity_table, action FROM audit_log WHERE id = ?')
        .get('test-audit-1') as {
        id: string;
        entity_table: string;
        action: string;
      };
      expect(row).toBeDefined();
      expect(row.id).toBe('test-audit-1');
      expect(row.action).toBe('SETTING_CHANGE');
    } finally {
      db.close();
    }
  });

  it('raises "audit_log is append-only" when attempting UPDATE', () => {
    const db = openDatabase(tempDbPath);
    try {
      db.prepare(
        `
        INSERT INTO audit_log (id, entity_table, entity_id, action, created_at)
        VALUES ('test-audit-2', 'app_settings', 'rounding.rule', 'SETTING_CHANGE', '2026-08-25T12:00:00.000Z')
      `,
      ).run();

      expect(() => {
        db.prepare("UPDATE audit_log SET reason = 'tampered' WHERE id = 'test-audit-2'").run();
      }).toThrow(/audit_log is append-only/);
    } finally {
      db.close();
    }
  });

  it('raises "audit_log is append-only" when attempting DELETE', () => {
    const db = openDatabase(tempDbPath);
    try {
      db.prepare(
        `
        INSERT INTO audit_log (id, entity_table, entity_id, action, created_at)
        VALUES ('test-audit-3', 'app_settings', 'rounding.rule', 'SETTING_CHANGE', '2026-08-25T12:00:00.000Z')
      `,
      ).run();

      expect(() => {
        db.prepare("DELETE FROM audit_log WHERE id = 'test-audit-3'").run();
      }).toThrow(/audit_log is append-only/);
    } finally {
      db.close();
    }
  });

  it('ensures withAudit atomicity: business change and audit entry roll back together on failure', () => {
    const db = openDatabase(tempDbPath);
    try {
      expect(() => {
        withAudit(
          db,
          {
            entityTable: 'app_settings',
            entityId: 'fail_key',
            action: 'SETTING_CHANGE',
          },
          () => {
            db.prepare(
              "INSERT INTO app_settings (key, value_json, updated_at) VALUES ('fail_key', '\"val\"', '2026-08-25T12:00:00.000Z')",
            ).run();
            // Force an error inside the transaction
            throw new Error('Simulated business mutation failure');
          },
        );
      }).toThrow('Simulated business mutation failure');

      // Assert setting was NOT saved
      const setting = db.prepare('SELECT * FROM app_settings WHERE key = ?').get('fail_key');
      expect(setting).toBeUndefined();

      // Assert audit log entry was NOT saved
      const audit = db.prepare("SELECT * FROM audit_log WHERE entity_id = 'fail_key'").get();
      expect(audit).toBeUndefined();
    } finally {
      db.close();
    }
  });
});
