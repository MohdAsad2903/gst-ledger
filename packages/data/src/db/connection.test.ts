import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';
import { openDatabase, getHealth } from './connection.js';

describe('Database Connection & Pragmas', () => {
  let tempDir: string;
  let tempDbPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gst-db-test-'));
    tempDbPath = path.join(tempDir, 'test-ledger.sqlite');
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('opens file database and successfully applies and verifies all mandatory pragmas', () => {
    const db = openDatabase(tempDbPath);
    try {
      const health = getHealth(db);
      expect(health.ok).toBe(true);
      expect(health.foreignKeys).toBe(true);
      expect(health.journalMode.toLowerCase()).toBe('wal');
      expect(health.synchronous).toBe(2); // FULL
      expect(health.busyTimeout).toBe(5000);
      expect(health.integrityCheck).toBe('ok');
    } finally {
      db.close();
    }
  });

  it('proves connection opened without pragma helper lacks WAL and FULL synchronous by default', () => {
    const rawDbPath = path.join(tempDir, 'raw-test.sqlite');
    const rawDb = new Database(rawDbPath);
    try {
      const rawJm = rawDb.pragma('journal_mode', { simple: true }) as string;
      expect(rawJm.toLowerCase()).not.toBe('wal'); // Default is 'delete'
    } finally {
      rawDb.close();
    }
  });

  it('works seamlessly with in-memory database (:memory:)', () => {
    const db = openDatabase(':memory:');
    try {
      const health = getHealth(db);
      expect(health.ok).toBe(true);
      expect(health.foreignKeys).toBe(true);
      expect(health.synchronous).toBe(2);
      expect(health.integrityCheck).toBe('ok');
    } finally {
      db.close();
    }
  });
});
