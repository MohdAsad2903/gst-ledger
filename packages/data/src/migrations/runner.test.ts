import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { openDatabase } from '../db/connection.js';
import {
  runMigrations,
  getCurrentSchemaVersion,
  getPendingMigrations,
  getAppliedMigrations,
} from './runner.js';

describe('Migration Runner', () => {
  let tempDir: string;
  let tempDbPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gst-migration-test-'));
    tempDbPath = path.join(tempDir, 'test-ledger.sqlite');
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('applies all 7 migrations on fresh database and is completely idempotent on second run', async () => {
    const db = openDatabase(tempDbPath);
    try {
      // First run: apply all migrations (0001, 0002, 0003, 0004, 0005, 0006, 0007)
      const res1 = await runMigrations(db);
      expect(res1.appliedCount).toBe(7);
      expect(res1.currentVersion).toBe(7);
      expect(getCurrentSchemaVersion(db)).toBe(7);

      const applied = getAppliedMigrations(db);
      expect(applied.length).toBe(7);
      expect(applied[0]?.name).toBe('foundation');
      expect(applied[1]?.name).toBe('seed_foundation');
      expect(applied[2]?.name).toBe('update_states');
      expect(applied[3]?.name).toBe('prompt2_schema');
      expect(applied[4]?.name).toBe('seed_org_units_and_suppliers');
      expect(applied[5]?.name).toBe('remove_seeded_parties');
      expect(applied[6]?.name).toBe('seed_parties_verified');

      // Second run: no-op
      const res2 = await runMigrations(db);
      expect(res2.appliedCount).toBe(0);
      expect(res2.currentVersion).toBe(7);
      expect(res2.appliedMigrations.length).toBe(0);
    } finally {
      db.close();
    }
  });

  it('triggers beforeMigrate hook prior to executing pending migrations', async () => {
    const db = openDatabase(tempDbPath);
    let hookCalled = false;
    let pendingCount = 0;

    try {
      await runMigrations(db, {
        beforeMigrate: pending => {
          hookCalled = true;
          pendingCount = pending.length;
        },
      });

      expect(hookCalled).toBe(true);
      expect(pendingCount).toBe(7);
    } finally {
      db.close();
    }
  });

  it('Defect 7 · Migration 0003 updates State 26 name and marks 25 and 28 inactive', async () => {
    const db = openDatabase(tempDbPath);
    try {
      await runMigrations(db);

      const state26 = db.prepare("SELECT * FROM states WHERE code = '26'").get() as {
        name: string;
        is_active: number;
      };
      expect(state26.name).toBe('Dadra and Nagar Haveli and Daman and Diu');
      expect(state26.is_active).toBe(1);

      const state25 = db.prepare("SELECT * FROM states WHERE code = '25'").get() as {
        is_active: number;
      };
      expect(state25.is_active).toBe(0);

      const state28 = db.prepare("SELECT * FROM states WHERE code = '28'").get() as {
        is_active: number;
      };
      expect(state28.is_active).toBe(0);
    } finally {
      db.close();
    }
  });

  it('rolls back completely when a migration fails midway and leaves schema_migrations untouched', async () => {
    const customMigDir = path.join(tempDir, 'failing-migrations');
    fs.mkdirSync(customMigDir, { recursive: true });

    // Valid migration 1
    fs.writeFileSync(
      path.join(customMigDir, '0001_valid.sql'),
      'CREATE TABLE test_table (id TEXT PRIMARY KEY);',
      'utf8',
    );

    // Invalid migration 2 (syntax error)
    fs.writeFileSync(
      path.join(customMigDir, '0002_broken.sql'),
      'INVALID SQL SYNTAX HERE;',
      'utf8',
    );

    const db = openDatabase(tempDbPath);
    try {
      await expect(runMigrations(db, { migrationsDir: customMigDir })).rejects.toThrow(
        /Migration failed at version 2/,
      );

      // Version 1 succeeded, version 2 rolled back
      expect(getCurrentSchemaVersion(db)).toBe(1);
      const applied = getAppliedMigrations(db);
      expect(applied.length).toBe(1);
      expect(applied[0]?.version).toBe(1);
    } finally {
      db.close();
    }
  });

  it('refuses to start when an applied migration file has been edited (checksum mismatch)', async () => {
    const customMigDir = path.join(tempDir, 'checksum-migrations');
    fs.mkdirSync(customMigDir, { recursive: true });

    const migFile = path.join(customMigDir, '0001_initial.sql');
    fs.writeFileSync(migFile, 'CREATE TABLE test_one (id TEXT PRIMARY KEY);', 'utf8');

    const db = openDatabase(tempDbPath);
    try {
      // Apply initial migration
      await runMigrations(db, { migrationsDir: customMigDir });
      expect(getCurrentSchemaVersion(db)).toBe(1);

      // Tamper with the migration file content
      fs.writeFileSync(
        migFile,
        'CREATE TABLE test_one (id TEXT PRIMARY KEY, extra_col TEXT);',
        'utf8',
      );

      // Attempt to run migrations again
      await expect(runMigrations(db, { migrationsDir: customMigDir })).rejects.toThrow(
        /Migration checksum mismatch for migration 1 \(initial\)/,
      );
    } finally {
      db.close();
    }
  });

  it('refuses to start if database schema version is ahead of application supported migrations', async () => {
    const customMigDir = path.join(tempDir, 'app-migrations');
    fs.mkdirSync(customMigDir, { recursive: true });

    // Only migration 0001 is available in the application
    fs.writeFileSync(
      path.join(customMigDir, '0001_first.sql'),
      'CREATE TABLE t1 (id TEXT PRIMARY KEY);',
      'utf8',
    );

    const db = openDatabase(tempDbPath);
    try {
      await runMigrations(db, { migrationsDir: customMigDir });

      // Simulate a newer database with version 2 recorded
      db.prepare(
        'INSERT INTO schema_migrations (version, name, applied_at, checksum) VALUES (?, ?, ?, ?)',
      ).run(2, 'future_feature', new Date().toISOString(), 'fake-checksum');

      expect(() => getPendingMigrations(db, customMigDir)).toThrow(
        /Database schema version \(2\) is ahead of application supported version \(1\)/,
      );
    } finally {
      db.close();
    }
  });

  it('Defect 10 · refuses to start if an applied migration file has been deleted', async () => {
    const customMigDir = path.join(tempDir, 'deleted-mig-test');
    fs.mkdirSync(customMigDir, { recursive: true });

    const file1 = path.join(customMigDir, '0001_first.sql');
    const file2 = path.join(customMigDir, '0002_second.sql');

    fs.writeFileSync(file1, 'CREATE TABLE table_one (id TEXT PRIMARY KEY);', 'utf8');
    fs.writeFileSync(file2, 'CREATE TABLE table_two (id TEXT PRIMARY KEY);', 'utf8');

    const db = openDatabase(tempDbPath);
    try {
      await runMigrations(db, { migrationsDir: customMigDir });
      expect(getCurrentSchemaVersion(db)).toBe(2);

      // Delete migration file 1
      fs.unlinkSync(file1);

      expect(() => getPendingMigrations(db, customMigDir)).toThrow(
        /Migration file missing for applied version 1 \(first\)/,
      );
    } finally {
      db.close();
    }
  });

  it('Defect 9 · transparently handles CRLF vs LF line ending normalisation on Windows clones', async () => {
    const customMigDir = path.join(tempDir, 'crlf-mig-test');
    fs.mkdirSync(customMigDir, { recursive: true });

    const contentWithLf = 'CREATE TABLE crlf_test (\n  id TEXT PRIMARY KEY\n);\n';
    const contentWithCrlf = 'CREATE TABLE crlf_test (\r\n  id TEXT PRIMARY KEY\r\n);\r\n';

    const migPath = path.join(customMigDir, '0001_crlf.sql');
    // Write file with CRLF
    fs.writeFileSync(migPath, contentWithCrlf, 'utf8');

    const rawCrlfHash = crypto.createHash('sha256').update(contentWithCrlf, 'utf8').digest('hex');

    const db = openDatabase(tempDbPath);
    try {
      // Simulate an existing database that recorded the unnormalized raw CRLF hash
      db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TEXT NOT NULL,
          checksum TEXT NOT NULL
        );
        CREATE TABLE crlf_test (id TEXT PRIMARY KEY);
      `);
      db.prepare(
        'INSERT INTO schema_migrations (version, name, applied_at, checksum) VALUES (?, ?, ?, ?)',
      ).run(1, 'crlf', new Date().toISOString(), rawCrlfHash);

      // Verify that getPendingMigrations starts cleanly and updates recorded hash to normalized LF hash
      const pending = getPendingMigrations(db, customMigDir);
      expect(pending.length).toBe(0);

      const applied = getAppliedMigrations(db);
      const expectedNormalizedHash = crypto
        .createHash('sha256')
        .update(contentWithLf, 'utf8')
        .digest('hex');
      expect(applied[0]?.checksum).toBe(expectedNormalizedHash);
    } finally {
      db.close();
    }
  });
});
