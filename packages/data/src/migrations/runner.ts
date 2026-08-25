import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface MigrationFile {
  version: number;
  name: string;
  filename: string;
  filePath: string;
  sql: string;
  checksum: string;
}

export interface AppliedMigration {
  version: number;
  name: string;
  applied_at: string;
  checksum: string;
}

export interface MigrationOptions {
  migrationsDir?: string;
  /**
   * Hook executed immediately before pending migrations are run.
   * Part 1D will use this to take an automatic backup before any migration.
   */
  beforeMigrate?: (pending: MigrationFile[]) => Promise<void> | void;
}

export interface MigrationResult {
  appliedCount: number;
  currentVersion: number;
  appliedMigrations: MigrationFile[];
}

/**
 * Resolves the default migrations directory across development, tests, and bundled runtime.
 */
export function getDefaultMigrationsDir(): string {
  const candidates = [
    path.resolve(__dirname, '../../migrations'),
    path.resolve(__dirname, '../packages/data/migrations'),
    path.resolve(process.cwd(), 'packages/data/migrations'),
  ];

  for (const cand of candidates) {
    if (fs.existsSync(cand)) {
      return cand;
    }
  }

  return path.resolve(process.cwd(), 'packages/data/migrations');
}

/**
 * Computes SHA-256 hash of a migration file's content.
 */
export function computeFileChecksum(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Reads and parses all available migration files in the migrations directory.
 *
 * @param dir Migrations directory path
 * @returns Sorted array of MigrationFile objects (sorted by version ascending)
 */
export function loadMigrationFiles(dir: string = getDefaultMigrationsDir()): MigrationFile[] {
  if (!fs.existsSync(dir)) {
    throw new Error(`Migrations directory does not exist: ${dir}`);
  }

  const files = fs.readdirSync(dir);
  const migrationFiles: MigrationFile[] = [];

  for (const filename of files) {
    const match = filename.match(/^(\d{4})_(.+)\.sql$/);
    if (!match) continue;

    const version = parseInt(match[1]!, 10);
    const name = match[2]!;
    const filePath = path.join(dir, filename);
    const sql = fs.readFileSync(filePath, 'utf8');
    const checksum = computeFileChecksum(sql);

    migrationFiles.push({
      version,
      name,
      filename,
      filePath,
      sql,
      checksum,
    });
  }

  return migrationFiles.sort((a, b) => a.version - b.version);
}

/**
 * Ensures the schema_migrations table exists in the database.
 */
export function ensureSchemaMigrationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL,
      checksum TEXT NOT NULL
    );
  `);
}

/**
 * Returns all applied migrations from the database sorted by version ascending.
 */
export function getAppliedMigrations(db: Database.Database): AppliedMigration[] {
  ensureSchemaMigrationsTable(db);
  const rows = db
    .prepare(
      'SELECT version, name, applied_at, checksum FROM schema_migrations ORDER BY version ASC',
    )
    .all();
  return rows as AppliedMigration[];
}

/**
 * Returns the current schema version (highest applied version, or 0 if none).
 */
export function getCurrentSchemaVersion(db: Database.Database): number {
  ensureSchemaMigrationsTable(db);
  const row = db.prepare('SELECT MAX(version) as max_version FROM schema_migrations').get() as {
    max_version: number | null;
  };
  return row?.max_version ?? 0;
}

/**
 * Identifies pending migrations that have not yet been applied.
 */
export function getPendingMigrations(
  db: Database.Database,
  migrationsDir: string = getDefaultMigrationsDir(),
): MigrationFile[] {
  const applied = getAppliedMigrations(db);
  const appliedMap = new Map<number, AppliedMigration>();
  for (const m of applied) {
    appliedMap.set(m.version, m);
  }

  const available = loadMigrationFiles(migrationsDir);

  // Validate existing applied migrations against file checksums
  for (const file of available) {
    const appliedRecord = appliedMap.get(file.version);
    if (appliedRecord) {
      if (appliedRecord.checksum !== file.checksum) {
        throw new Error(
          `Migration checksum mismatch for migration ${file.version} (${file.name}): applied checksum ${appliedRecord.checksum} !== file checksum ${file.checksum}. Applied migrations must never be modified.`,
        );
      }
    }
  }

  // Check if database version is ahead of available migrations
  const maxApplied = applied.length > 0 ? Math.max(...applied.map(a => a.version)) : 0;
  const maxAvailable = available.length > 0 ? Math.max(...available.map(a => a.version)) : 0;
  if (maxApplied > maxAvailable) {
    throw new Error(
      `Database schema version (${maxApplied}) is ahead of application supported version (${maxAvailable}). This file was created by a newer version of GST Ledger.`,
    );
  }

  return available.filter(f => !appliedMap.has(f.version));
}

/**
 * Runs all pending migrations in forward numerical order inside individual transactions.
 *
 * @param db better-sqlite3 Database instance
 * @param options Optional migration settings (custom directory, beforeMigrate hook)
 * @returns MigrationResult detailing applied migrations
 */
export async function runMigrations(
  db: Database.Database,
  options?: MigrationOptions,
): Promise<MigrationResult> {
  const dir = options?.migrationsDir ?? getDefaultMigrationsDir();
  ensureSchemaMigrationsTable(db);

  const pending = getPendingMigrations(db, dir);

  if (pending.length === 0) {
    return {
      appliedCount: 0,
      currentVersion: getCurrentSchemaVersion(db),
      appliedMigrations: [],
    };
  }

  // Trigger beforeMigrate hook if provided (e.g. for automatic backup in Part 1D)
  if (options?.beforeMigrate) {
    await options.beforeMigrate(pending);
  }

  const appliedMigrations: MigrationFile[] = [];

  for (const migration of pending) {
    const applyTransaction = db.transaction(() => {
      // 1. Execute SQL script
      db.exec(migration.sql);

      // 2. Record migration in schema_migrations
      const appliedAt = new Date().toISOString();
      db.prepare(
        'INSERT INTO schema_migrations (version, name, applied_at, checksum) VALUES (?, ?, ?, ?)',
      ).run(migration.version, migration.name, appliedAt, migration.checksum);
    });

    try {
      applyTransaction();
      appliedMigrations.push(migration);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Migration failed at version ${migration.version} (${migration.filename}): ${message}`,
      );
    }
  }

  return {
    appliedCount: appliedMigrations.length,
    currentVersion: getCurrentSchemaVersion(db),
    appliedMigrations,
  };
}
