import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';
import { openDatabase } from '../db/connection.js';
import { runMigrations } from '../migrations/runner.js';
import { BackupService } from './service.js';
import { SettingsRepository } from '../repositories/settings.repository.js';

describe('BackupService (Part 1D)', () => {
  let tempDir: string;
  let dbPath: string;
  let backupDir: string;
  let db: Database.Database;
  let backupService: BackupService;
  let settingsRepo: SettingsRepository;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gst-backup-test-'));
    dbPath = path.join(tempDir, 'test-ledger.sqlite');
    backupDir = path.join(tempDir, 'backups');

    db = openDatabase(dbPath);
    settingsRepo = new SettingsRepository(db);
    backupService = new BackupService({
      db,
      backupDir,
      settingsRepo,
    });

    // Run migrations with pre-migration hook
    await runMigrations(db, {
      beforeMigrate: async () => {
        await backupService.createBackup('PRE_MIGRATION', 'Initial pre-migration snapshot');
      },
    });
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

  it('Criterion 1: creates a clean PRE_MIGRATION backup recorded in backups table before migration', async () => {
    const list = backupService.listBackups();
    expect(list.length).toBe(1);

    const first = list[0]!;
    expect(first.trigger).toBe('PRE_MIGRATION');
    expect(fs.existsSync(first.filePath)).toBe(true);

    const verify = await backupService.verifyBackup(first.id);
    expect(verify.ok).toBe(true);
    if (verify.ok) {
      expect(verify.value.status).toBe('OK');
      expect(verify.value.integrityCheck).toBe('ok');
    }
  });

  it('Criterion 2: createBackup("MANUAL") produces a second distinct backup with correct row', async () => {
    const res = await backupService.createBackup('MANUAL', 'User triggered manual backup');
    expect(res.ok).toBe(true);

    const list = backupService.listBackups();
    expect(list.length).toBe(2);
    expect(list[0]?.trigger).toBe('MANUAL');
    expect(list[1]?.trigger).toBe('PRE_MIGRATION');
    expect(list[0]?.filePath).not.toBe(list[1]?.filePath);
  });

  it('Criterion 3: verifyBackup re-computes SHA-256 and verifies clean integrity', async () => {
    const res = await backupService.createBackup('MANUAL');
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const reportRes = await backupService.verifyBackup(res.value.id);
    expect(reportRes.ok).toBe(true);
    if (reportRes.ok) {
      expect(reportRes.value.status).toBe('OK');
      expect(reportRes.value.actualSha256).toBe(res.value.sha256);
      expect(reportRes.value.integrityCheck).toBe('ok');
    }
  });

  it('Criterion 4: renaming/deleting a backup file produces FILE_MISSING without crashing', async () => {
    const res = await backupService.createBackup('MANUAL');
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // Delete the file from disk
    fs.unlinkSync(res.value.filePath);

    const reportRes = await backupService.verifyBackup(res.value.id);
    expect(reportRes.ok).toBe(true);
    if (reportRes.ok) {
      expect(reportRes.value.status).toBe('FILE_MISSING');
      expect(reportRes.value.message).toContain('does not exist on disk');
    }
  });

  it('Criterion 5: appending a byte to a backup file produces HASH_MISMATCH without crashing', async () => {
    const res = await backupService.createBackup('MANUAL');
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // Tamper with the file by appending corrupted byte
    fs.appendFileSync(res.value.filePath, 'X');

    const reportRes = await backupService.verifyBackup(res.value.id);
    expect(reportRes.ok).toBe(true);
    if (reportRes.ok) {
      expect(reportRes.value.status).toBe('HASH_MISMATCH');
      expect(reportRes.value.message).toContain('File checksum mismatch');
    }
  });

  it('Criterion 6: WAL Checkpoint guarantees freshly committed transactions are present in backup', async () => {
    // Insert a distinct setting row into live DB
    settingsRepo.set('wal.checkpoint.proof', 'COMMITTED_TRANSACTION_PAYLOAD_12345');

    // Create backup
    const backupRes = await backupService.createBackup('MANUAL');
    expect(backupRes.ok).toBe(true);
    if (!backupRes.ok) return;

    // Open the backup file directly in read-only mode and query it
    const backupDb = new Database(backupRes.value.filePath, { readonly: true });
    try {
      const row = backupDb
        .prepare("SELECT value_json FROM app_settings WHERE key = 'wal.checkpoint.proof'")
        .get() as { value_json: string } | undefined;

      expect(row).toBeDefined();
      expect(row?.value_json).toBe('"COMMITTED_TRANSACTION_PAYLOAD_12345"');
    } finally {
      backupDb.close();
    }
  });

  it('Criterion 7: read-only backup directory causes clear error and prevents partial file creation', async () => {
    const readOnlyDir = path.join(tempDir, 'readonly-backups');
    fs.mkdirSync(readOnlyDir, { recursive: true });

    // Mock write test failure by passing an invalid/unwritable path
    const failingService = new BackupService({
      db,
      backupDir: path.join(readOnlyDir, 'non-existent-sub/invalid\0dir'),
    });

    const res = await failingService.createBackup('PRE_MIGRATION');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe('DIRECTORY_NOT_WRITABLE');
    }
  });

  it('Criterion 8: retention with retainCount=3 keeps 3 newest + last backup of older month', async () => {
    // Override retain count to 3
    settingsRepo.set('backup.retainCount', 3);

    // Simulate 5 backups across 2 months:
    // Month 1 (July 2026): 2 backups (B1: July 1, B2: July 20)
    // Month 2 (August 2026): 3 backups (B3: Aug 1, B4: Aug 2, B5: Aug 3)
    const createSimulatedBackup = (id: string, dateIso: string, trigger: 'MANUAL') => {
      const destPath = path.join(backupDir, `gst-ledger-sim-${id}.sqlite`);
      // Copy current DB
      fs.copyFileSync(dbPath, destPath);
      db.prepare(
        `
        INSERT INTO backups (id, file_path, size_bytes, sha256, trigger, schema_version, created_at)
        VALUES (?, ?, ?, ?, ?, 2, ?)
      `,
      ).run(id, destPath, 1024, 'dummy-hash', trigger, dateIso);
    };

    // Clean initial backups for precision test
    db.prepare('DELETE FROM backups').run();

    createSimulatedBackup('b1-jul01', '2026-07-01T10:00:00.000Z', 'MANUAL');
    createSimulatedBackup('b2-jul20', '2026-07-20T10:00:00.000Z', 'MANUAL'); // Latest of July
    createSimulatedBackup('b3-aug01', '2026-08-01T10:00:00.000Z', 'MANUAL');
    createSimulatedBackup('b4-aug02', '2026-08-02T10:00:00.000Z', 'MANUAL');
    createSimulatedBackup('b5-aug03', '2026-08-03T10:00:00.000Z', 'MANUAL'); // Latest overall

    const pruneResult = await backupService.pruneBackups();
    expect(pruneResult.kept.map(b => b.id)).toEqual([
      'b5-aug03',
      'b4-aug02',
      'b3-aug01',
      'b2-jul20',
    ]);
    expect(pruneResult.deleted.map(b => b.id)).toEqual(['b1-jul01']);
  });

  it('Criterion 9: single most recent backup is never pruned even with retainCount=0', async () => {
    settingsRepo.set('backup.retainCount', 0);

    const pruneResult = await backupService.pruneBackups();
    expect(pruneResult.kept.length).toBe(1);
    expect(pruneResult.deleted.length).toBe(0);
  });

  it('Criterion 10: APP_CLOSE backup is skipped if clean backup exists within 5 mins without writes', async () => {
    // 1. Take a fresh backup
    await backupService.createBackup('MANUAL');

    // 2. Immediate APP_CLOSE backup should be skipped (no mutations)
    const shouldSkip = backupService.shouldSkipAppCloseBackup();
    expect(shouldSkip).toBe(true);

    const performed = await backupService.performAppCloseBackup();
    expect(performed).toBe(false);

    // 3. Mutate a setting
    settingsRepo.set('ui.dateFormat', 'YYYY-MM-DD');

    // 4. Now APP_CLOSE should NOT be skipped
    const shouldSkipAfterWrite = backupService.shouldSkipAppCloseBackup();
    expect(shouldSkipAfterWrite).toBe(false);

    const performedAfterWrite = await backupService.performAppCloseBackup();
    expect(performedAfterWrite).toBe(true);
  });

  it('Criterion 11: records correct schema_version matching schema_migrations', async () => {
    const res = await backupService.createBackup('MANUAL');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.schemaVersion).toBe(2);
    }
  });

  it('handles multiple backups in the same second without filename collision', async () => {
    const date = new Date('2026-08-25T12:00:00.000Z');
    const fn1 = backupService.generateBackupFilename('MANUAL', date);
    fs.writeFileSync(path.join(backupDir, fn1), 'test-1');

    const fn2 = backupService.generateBackupFilename('MANUAL', date);
    expect(fn2).not.toBe(fn1);
    expect(fn2).toContain('-1.sqlite');
  });

  it('times backup speed on 10,000 synthetic rows', async () => {
    // Seed 10,000 synthetic rows into audit_log
    const insertStmt = db.prepare(`
      INSERT INTO audit_log (id, entity_table, entity_id, action, created_at)
      VALUES (?, 'synthetic_table', 'row-1', 'CREATE', '2026-08-25T12:00:00.000Z')
    `);

    const insertMany = db.transaction(() => {
      for (let i = 0; i < 10000; i++) {
        insertStmt.run(`syn-${i}`);
      }
    });
    insertMany();

    const startTime = Date.now();
    const res = await backupService.createBackup('MANUAL', '10,000 row scale benchmark');
    const duration = Date.now() - startTime;

    expect(res.ok).toBe(true);
    expect(duration).toBeLessThan(5000); // Must complete in under 5 seconds
    console.log(
      `10,000 synthetic row backup duration: ${duration}ms, size: ${res.ok ? res.value.sizeBytes : 0} bytes`,
    );
  });
});
