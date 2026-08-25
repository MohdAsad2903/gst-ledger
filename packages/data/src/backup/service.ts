import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import DatabaseConstructor, { type Database as SqliteDatabase } from 'better-sqlite3';
import type { Result } from '@gst/core';

const Database =
  typeof DatabaseConstructor === 'function'
    ? DatabaseConstructor
    : (DatabaseConstructor as unknown as { default: typeof DatabaseConstructor }).default;
import { getCurrentSchemaVersion } from '../migrations/runner.js';
import { SettingsRepository } from '../repositories/settings.repository.js';
import type {
  BackupError,
  BackupRecord,
  BackupServiceOptions,
  BackupTrigger,
  LoggerInterface,
  VerifyReport,
} from './types.js';

export class BackupService {
  private db: SqliteDatabase;
  private customBackupDir?: string;
  private settingsRepo: SettingsRepository;
  private logger?: LoggerInterface;

  constructor(options: BackupServiceOptions) {
    this.db = options.db;
    this.customBackupDir = options.backupDir;
    this.settingsRepo = options.settingsRepo ?? new SettingsRepository(this.db);
    this.logger = options.logger;
  }

  /**
   * Ensures the backups table exists in the database.
   */
  public ensureBackupsTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS backups (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        trigger TEXT NOT NULL CHECK (trigger IN ('MANUAL', 'APP_CLOSE', 'PRE_MIGRATION')),
        schema_version INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }

  /**
   * Resolves the configured backup directory path.
   * Priority: custom constructor option -> settings ('backup.directory') -> default './backups'
   */
  public getBackupDirectory(): string {
    if (this.customBackupDir) {
      return path.resolve(this.customBackupDir);
    }
    const fromSettings = this.settingsRepo.get<string>('backup.directory');
    if (fromSettings) {
      return path.resolve(fromSettings);
    }
    return path.resolve('./backups');
  }

  /**
   * Ensures the backup directory exists and has write permissions.
   */
  private ensureDirectoryWritable(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // Test write permission
    const testFile = path.join(dir, `.write-test-${Date.now()}`);
    try {
      fs.writeFileSync(testFile, 'test', 'utf8');
      fs.unlinkSync(testFile);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Backup directory is not writable (${dir}): ${msg}`);
    }
  }

  /**
   * Generates a collision-free, sortable backup filename:
   * gst-ledger-YYYYMMDD-HHmmss-<TRIGGER>.sqlite
   */
  public generateBackupFilename(trigger: BackupTrigger, date: Date = new Date()): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const yyyy = date.getFullYear();
    const mm = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());
    const hh = pad(date.getHours());
    const min = pad(date.getMinutes());
    const ss = pad(date.getSeconds());

    const baseName = `gst-ledger-${yyyy}${mm}${dd}-${hh}${min}${ss}-${trigger}`;
    const dir = this.getBackupDirectory();

    let filename = `${baseName}.sqlite`;
    let counter = 1;

    while (fs.existsSync(path.join(dir, filename))) {
      filename = `${baseName}-${counter}.sqlite`;
      counter++;
    }

    return filename;
  }

  /**
   * Computes SHA-256 hash of a file on disk.
   */
  public computeFileHash(filePath: string): string {
    const fileBuffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  /**
   * Creates a verified backup of the SQLite database using the online backup API.
   *
   * Flow:
   * 1. Ensure directory and write permissions.
   * 2. Checkpoint WAL (TRUNCATE).
   * 3. Stream backup to destination file via SQLite online backup API.
   * 4. Compute SHA-256 hash.
   * 5. Verify integrity (PRAGMA integrity_check) on copy.
   * 6. Record metadata in backups table.
   * 7. Prune older backups according to retention policy.
   *
   * @param trigger Trigger source ('MANUAL' | 'APP_CLOSE' | 'PRE_MIGRATION')
   * @param reason Optional human-readable rationale
   */
  public async createBackup(
    trigger: BackupTrigger,
    reason?: string,
  ): Promise<Result<BackupRecord, BackupError>> {
    const startTime = Date.now();
    const backupDir = this.getBackupDirectory();

    try {
      this.ensureDirectoryWritable(backupDir);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger?.error('Backup directory check failed', { error: msg, path: backupDir });
      return { ok: false, error: 'DIRECTORY_NOT_WRITABLE' };
    }

    const filename = this.generateBackupFilename(trigger);
    const destPath = path.join(backupDir, filename);

    try {
      // 1. Checkpoint WAL
      this.db.pragma('wal_checkpoint(TRUNCATE)');

      // 2. Online Backup API (never a raw file copy)
      await this.db.backup(destPath);

      // 3. Compute SHA-256
      const sha256 = this.computeFileHash(destPath);
      const sizeBytes = fs.statSync(destPath).size;

      // 4. Verify integrity on the copy
      let integrity = 'unknown';
      try {
        const verifyDb = new Database(destPath, { readonly: true });
        integrity = verifyDb.pragma('integrity_check', { simple: true }) as string;
        verifyDb.close();
      } catch {
        integrity = 'corrupt';
      }

      if (integrity !== 'ok') {
        if (fs.existsSync(destPath)) {
          fs.unlinkSync(destPath);
        }
        this.logger?.error('Backup integrity verification failed', {
          path: destPath,
          integrity,
        });
        return { ok: false, error: 'INTEGRITY_FAILED' };
      }

      // 5. Insert backup record
      this.ensureBackupsTable();
      const id = crypto.randomUUID();
      const schemaVersion = getCurrentSchemaVersion(this.db);
      const createdAt = new Date().toISOString();

      this.db
        .prepare(
          `
          INSERT INTO backups (id, file_path, size_bytes, sha256, trigger, schema_version, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(id, destPath, sizeBytes, sha256, trigger, schemaVersion, createdAt);

      const record: BackupRecord = {
        id,
        filePath: destPath,
        sizeBytes,
        sha256,
        trigger,
        schemaVersion,
        createdAt,
      };

      // 6. Prune older backups
      await this.pruneBackups();

      const durationMs = Date.now() - startTime;
      this.logger?.info('Database backup created successfully', {
        trigger,
        path: destPath,
        sizeBytes,
        durationMs,
        verification: 'OK',
        reason,
      });

      return { ok: true, value: record };
    } catch (err) {
      if (fs.existsSync(destPath)) {
        try {
          fs.unlinkSync(destPath);
        } catch {
          // ignore cleanup errors
        }
      }
      const msg = err instanceof Error ? err.message : String(err);
      this.logger?.error('Database backup failed', { trigger, path: destPath, error: msg });

      if (msg.includes('ENOSPC') || msg.toLowerCase().includes('disk full')) {
        return { ok: false, error: 'DISK_FULL' };
      }
      return { ok: false, error: 'BACKUP_FAILED' };
    }
  }

  /**
   * Lists all recorded backups from newest to oldest.
   */
  public listBackups(): BackupRecord[] {
    try {
      this.ensureBackupsTable();
      const rows = this.db
        .prepare(
          `
          SELECT id, file_path as filePath, size_bytes as sizeBytes, sha256, trigger,
                 schema_version as schemaVersion, created_at as createdAt
          FROM backups
          ORDER BY created_at DESC
        `,
        )
        .all() as BackupRecord[];

      return rows;
    } catch {
      return [];
    }
  }

  /**
   * Retrieves the most recent recorded backup.
   */
  public getLastBackup(): BackupRecord | null {
    const list = this.listBackups();
    return list[0] ?? null;
  }

  /**
   * Verifies an existing backup by re-hashing the disk file and running an integrity check.
   *
   * @param id Backup record UUID
   * @returns VerifyReport with status OK, FILE_MISSING, HASH_MISMATCH, or INTEGRITY_FAILED
   */
  public async verifyBackup(id: string): Promise<Result<VerifyReport, BackupError>> {
    this.ensureBackupsTable();
    const record = this.db
      .prepare('SELECT id, file_path, sha256 FROM backups WHERE id = ?')
      .get(id) as { id: string; file_path: string; sha256: string } | undefined;

    if (!record) {
      return { ok: false, error: 'NOT_FOUND' };
    }

    if (!fs.existsSync(record.file_path)) {
      return {
        ok: true,
        value: {
          status: 'FILE_MISSING',
          id: record.id,
          filePath: record.file_path,
          expectedSha256: record.sha256,
          message: `Backup file does not exist on disk: ${record.file_path}`,
        },
      };
    }

    // Checksum verification
    const actualSha256 = this.computeFileHash(record.file_path);
    if (actualSha256 !== record.sha256) {
      return {
        ok: true,
        value: {
          status: 'HASH_MISMATCH',
          id: record.id,
          filePath: record.file_path,
          expectedSha256: record.sha256,
          actualSha256,
          message: `File checksum mismatch: recorded ${record.sha256} !== actual ${actualSha256}`,
        },
      };
    }

    // Integrity check
    let integrity = 'unknown';
    try {
      const verifyDb = new Database(record.file_path, { readonly: true });
      integrity = verifyDb.pragma('integrity_check', { simple: true }) as string;
      verifyDb.close();
    } catch (err) {
      integrity = err instanceof Error ? err.message : 'corrupt';
    }

    if (integrity !== 'ok') {
      return {
        ok: true,
        value: {
          status: 'INTEGRITY_FAILED',
          id: record.id,
          filePath: record.file_path,
          expectedSha256: record.sha256,
          actualSha256,
          integrityCheck: integrity,
          message: `PRAGMA integrity_check failed: ${integrity}`,
        },
      };
    }

    return {
      ok: true,
      value: {
        status: 'OK',
        id: record.id,
        filePath: record.file_path,
        expectedSha256: record.sha256,
        actualSha256,
        integrityCheck: 'ok',
        message: 'Backup verified clean',
      },
    };
  }

  /**
   * Prunes older backups according to the retention policy:
   * - Keep newest `retainCount` backups (default 30).
   * - NEVER prune the single most recent backup of any calendar month.
   * - NEVER prune the single most recent backup overall.
   */
  public async pruneBackups(): Promise<{ deleted: BackupRecord[]; kept: BackupRecord[] }> {
    const allBackups = this.listBackups();
    if (allBackups.length <= 1) {
      return { deleted: [], kept: allBackups };
    }

    const retainCount = Math.max(0, this.settingsRepo.getBackupRetainCount());
    const protectedIds = new Set<string>();

    // 1. Protect the single most recent backup overall
    if (allBackups[0]) {
      protectedIds.add(allBackups[0].id);
    }

    // 2. Protect the most recent backup of EVERY calendar month
    const monthMap = new Map<string, BackupRecord>();
    for (const bk of allBackups) {
      const monthKey = bk.createdAt.slice(0, 7); // YYYY-MM
      if (!monthMap.has(monthKey)) {
        // Since allBackups is sorted DESC, the first one encountered is the latest in that month
        monthMap.set(monthKey, bk);
        protectedIds.add(bk.id);
      }
    }

    const kept: BackupRecord[] = [];
    const deleted: BackupRecord[] = [];

    // Keep the newest retainCount backups, or any protected backup
    allBackups.forEach((bk, index) => {
      const isWithinRetainCount = index < retainCount;
      const isProtected = protectedIds.has(bk.id);

      if (isWithinRetainCount || isProtected) {
        kept.push(bk);
      } else {
        deleted.push(bk);
      }
    });

    // Delete pruned files and records
    for (const toDelete of deleted) {
      if (fs.existsSync(toDelete.filePath)) {
        try {
          fs.unlinkSync(toDelete.filePath);
        } catch {
          this.logger?.warn('Failed to delete pruned backup file', { path: toDelete.filePath });
        }
      }
      this.db.prepare('DELETE FROM backups WHERE id = ?').run(toDelete.id);
    }

    return { deleted, kept };
  }

  /**
   * Checks whether an APP_CLOSE backup can be skipped:
   * True if a backup exists within the last 5 minutes AND no write mutations occurred since.
   */
  public shouldSkipAppCloseBackup(): boolean {
    const lastBackup = this.getLastBackup();
    if (!lastBackup) {
      return false;
    }

    const lastBackupTime = new Date(lastBackup.createdAt).getTime();
    const now = Date.now();
    const fiveMinutesMs = 5 * 60 * 1000;

    if (now - lastBackupTime > fiveMinutesMs) {
      return false;
    }

    // Check if any audit_log entry occurred after the last backup
    try {
      const mutationRow = this.db
        .prepare('SELECT COUNT(*) as c FROM audit_log WHERE created_at > ?')
        .get(lastBackup.createdAt) as { c: number } | undefined;

      const mutationsSinceBackup = mutationRow?.c ?? 0;
      return mutationsSinceBackup === 0;
    } catch {
      return false;
    }
  }

  /**
   * Executes an automatic backup on application close with a 10-second timeout safeguard.
   */
  public async performAppCloseBackup(): Promise<boolean> {
    const enabled = this.settingsRepo.getBackupOnAppClose();
    if (!enabled) {
      return false;
    }

    if (this.shouldSkipAppCloseBackup()) {
      this.logger?.info('Skipping APP_CLOSE backup (clean backup exists within last 5 minutes)');
      return false;
    }

    // 10-second timeout promise race
    const backupPromise = this.createBackup('APP_CLOSE', 'Application quit automatic backup');
    const timeoutPromise = new Promise<null>(resolve => setTimeout(() => resolve(null), 10000));

    const result = await Promise.race([backupPromise, timeoutPromise]);
    if (result === null) {
      this.logger?.warn('APP_CLOSE backup timed out after 10 seconds; proceeding with shutdown');
      return false;
    }

    return result.ok;
  }
}
