import fs from 'node:fs';
import path from 'node:path';
import DatabaseConstructor, { type Database as SqliteDatabase } from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

const Database =
  typeof DatabaseConstructor === 'function'
    ? DatabaseConstructor
    : (DatabaseConstructor as unknown as { default: typeof DatabaseConstructor }).default;

export type AppDatabase = BetterSQLite3Database<typeof schema>;

export interface DatabaseHealth {
  ok: boolean;
  integrityCheck: string;
  foreignKeys: boolean;
  journalMode: string;
  synchronous: number;
  busyTimeout: number;
}

/**
 * Sets and rigorously verifies mandatory SQLite pragmas on a connection.
 */
export function applyAndVerifyPragmas(db: SqliteDatabase, isInMemory = false): void {
  try {
    // 1. Set Pragmas
    if (!isInMemory) {
      db.pragma('journal_mode = WAL');
    }
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    db.pragma('synchronous = FULL');

    // 2. Read back and verify each pragma
    const fkResult = db.pragma('foreign_keys', { simple: true }) as number;
    if (fkResult !== 1) {
      throw new Error(
        `Critical SQLite error: PRAGMA foreign_keys failed to enable (read back: ${fkResult})`,
      );
    }

    if (!isInMemory) {
      const jmResult = db.pragma('journal_mode', { simple: true }) as string;
      if (jmResult.toLowerCase() !== 'wal') {
        throw new Error(
          `Critical SQLite error: PRAGMA journal_mode failed to switch to WAL (read back: ${jmResult})`,
        );
      }
    }

    const timeoutResult = db.pragma('busy_timeout', { simple: true }) as number;
    if (timeoutResult < 5000) {
      throw new Error(
        `Critical SQLite error: PRAGMA busy_timeout failed (read back: ${timeoutResult})`,
      );
    }

    const syncResult = db.pragma('synchronous', { simple: true }) as number;
    if (syncResult !== 2) {
      // 2 corresponds to FULL synchronous mode
      throw new Error(`Critical SQLite error: PRAGMA synchronous failed (read back: ${syncResult})`);
    }
  } catch (err) {
    console.error('ERROR IN applyAndVerifyPragmas:', err);
    throw err;
  }
}

/**
 * Opens a SQLite database connection with verified pragmas.
 */
export function openDatabase(
  dbPath: string,
  options?: { applyPragmas?: boolean },
): SqliteDatabase {
  const isInMemory = dbPath === ':memory:';
  if (!isInMemory) {
    const dir = path.dirname(path.resolve(dbPath));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  const db = new Database(dbPath);

  if (options?.applyPragmas !== false) {
    applyAndVerifyPragmas(db, isInMemory);
  }

  return db;
}

/**
 * Creates a Drizzle ORM database instance around a better-sqlite3 database.
 */
export function createDrizzleDb(sqliteDb: SqliteDatabase): AppDatabase {
  return drizzle(sqliteDb, { schema });
}

/**
 * Reads live health status of the SQLite database connection.
 */
export function getHealth(db: SqliteDatabase): DatabaseHealth {
  const integrity = db.pragma('integrity_check', { simple: true }) as string;
  const fk = (db.pragma('foreign_keys', { simple: true }) as number) === 1;
  const jm = db.pragma('journal_mode', { simple: true }) as string;
  const sync = db.pragma('synchronous', { simple: true }) as number;
  const timeout = db.pragma('busy_timeout', { simple: true }) as number;

  const isHealthy = integrity === 'ok' && fk;

  return {
    ok: isHealthy,
    integrityCheck: integrity,
    foreignKeys: fk,
    journalMode: jm,
    synchronous: sync,
    busyTimeout: timeout,
  };
}
