import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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

  it('applies all migrations on fresh database and is completely idempotent on second run', async () => {
    const db = openDatabase(tempDbPath);
    try {
      // First run: apply all migrations
      const res1 = await runMigrations(db);
      expect(res1.appliedCount).toBe(2);
      expect(res1.currentVersion).toBe(2);
      expect(getCurrentSchemaVersion(db)).toBe(2);

      const applied = getAppliedMigrations(db);
      expect(applied.length).toBe(2);
      expect(applied[0]?.name).toBe('foundation');
      expect(applied[1]?.name).toBe('seed_foundation');

      // Second run: no-op
      const res2 = await runMigrations(db);
      expect(res2.appliedCount).toBe(0);
      expect(res2.currentVersion).toBe(2);
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
      expect(pendingCount).toBe(2);
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
});
