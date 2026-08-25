import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDatabase } from './connection.js';
import { runMigrations } from '../migrations/runner.js';

describe('Seed Data Verification & Idempotence', () => {
  let tempDir: string;
  let tempDbPath: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gst-seed-test-'));
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

  it('verifies complete official GST state master list (40 entries)', () => {
    const db = openDatabase(tempDbPath);
    try {
      const rows = db
        .prepare('SELECT code, name, is_union_territory, is_active FROM states ORDER BY code ASC')
        .all() as Array<{
        code: string;
        name: string;
        is_union_territory: number;
        is_active: number;
      }>;

      expect(rows.length).toBe(40);

      // Verify Uttar Pradesh (09) and Delhi (07)
      const up = rows.find(r => r.code === '09');
      expect(up).toBeDefined();
      expect(up?.name).toBe('Uttar Pradesh');
      expect(up?.is_union_territory).toBe(0);

      const delhi = rows.find(r => r.code === '07');
      expect(delhi).toBeDefined();
      expect(delhi?.name).toBe('Delhi');
      expect(delhi?.is_union_territory).toBe(1);

      // Verify boundaries 01, 38, 96, 97
      expect(rows.find(r => r.code === '01')?.name).toBe('Jammu and Kashmir');
      expect(rows.find(r => r.code === '38')?.name).toBe('Ladakh');
      expect(rows.find(r => r.code === '96')?.name).toBe('Other Country');
      expect(rows.find(r => r.code === '97')?.name).toBe('Other Territory');
    } finally {
      db.close();
    }
  });

  it('verifies seeded tax rate profiles (September 2025 structure)', () => {
    const db = openDatabase(tempDbPath);
    try {
      const rows = db
        .prepare(
          'SELECT id, name, rate_bps, is_active FROM tax_rate_profiles ORDER BY rate_bps ASC',
        )
        .all() as Array<{
        id: string;
        name: string;
        rate_bps: number;
        is_active: number;
      }>;

      expect(rows.length).toBe(6);

      const rates = rows.map(r => ({ name: r.name, rate_bps: r.rate_bps, is_active: r.is_active }));
      expect(rates).toEqual([
        { name: 'Nil', rate_bps: 0, is_active: 1 },
        { name: 'GST 0.25% (rough diamonds)', rate_bps: 25, is_active: 0 },
        { name: 'GST 3% (precious metals)', rate_bps: 300, is_active: 0 },
        { name: 'GST 5%', rate_bps: 500, is_active: 1 },
        { name: 'GST 18%', rate_bps: 1800, is_active: 1 },
        { name: 'GST 40%', rate_bps: 4000, is_active: 1 },
      ]);
    } finally {
      db.close();
    }
  });

  it('proves seed idempotence: running seed SQL twice leaves row counts identical', () => {
    const db = openDatabase(tempDbPath);
    try {
      const countStates1 = db.prepare('SELECT COUNT(*) as c FROM states').get() as { c: number };
      const countRates1 = db.prepare('SELECT COUNT(*) as c FROM tax_rate_profiles').get() as {
        c: number;
      };
      const countSettings1 = db.prepare('SELECT COUNT(*) as c FROM app_settings').get() as {
        c: number;
      };

      expect(countStates1.c).toBe(40);
      expect(countRates1.c).toBe(6);
      expect(countSettings1.c).toBe(8);

      // Re-run migration 0002 seed manually
      const seedSql = fs.readFileSync(
        path.resolve(__dirname, '../../migrations/0002_seed_foundation.sql'),
        'utf8',
      );
      db.exec(seedSql);

      const countStates2 = db.prepare('SELECT COUNT(*) as c FROM states').get() as { c: number };
      const countRates2 = db.prepare('SELECT COUNT(*) as c FROM tax_rate_profiles').get() as {
        c: number;
      };
      const countSettings2 = db.prepare('SELECT COUNT(*) as c FROM app_settings').get() as {
        c: number;
      };

      expect(countStates2.c).toBe(40);
      expect(countRates2.c).toBe(6);
      expect(countSettings2.c).toBe(8);
    } finally {
      db.close();
    }
  });
});
