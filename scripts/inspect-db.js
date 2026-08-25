import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDatabase, runMigrations, SettingsRepository } from '../packages/data/src/index.js';
import { paise, roundToRupee } from '../packages/core/src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function inspect() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gst-inspect-'));
  const dbPath = path.join(tempDir, 'inspect.sqlite');
  const db = openDatabase(dbPath);
  const migDir = path.resolve(__dirname, '../packages/data/migrations');

  console.log('=== FIRST RUN (FRESH DATABASE) ===');
  const res1 = await runMigrations(db, { migrationsDir: migDir });
  console.log('First run result:', JSON.stringify(res1));

  console.log('\n=== SECOND RUN (IDEMPOTENT CHECK) ===');
  const res2 = await runMigrations(db, { migrationsDir: migDir });
  console.log('Second run result:', JSON.stringify(res2));

  console.log('\n=== PRAGMA TABLE_INFO FOR ALL 6 TABLES ===');
  const tables = [
    'schema_migrations',
    'app_settings',
    'states',
    'tax_rate_profiles',
    'audit_log',
    'backups',
  ];
  for (const t of tables) {
    console.log(`\n--- Table: ${t} ---`);
    const cols = db.prepare(`PRAGMA table_info(${t})`).all();
    console.table(cols);
  }

  console.log('\n=== TRIGGERS AND INDEXES (sqlite_master) ===');
  const objects = db
    .prepare(
      "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE type IN ('trigger', 'index') AND name NOT LIKE 'sqlite_%'",
    )
    .all();
  console.table(objects.map(o => ({ type: o.type, name: o.name, tbl_name: o.tbl_name })));

  console.log('\n=== SEEDED APP_SETTINGS ===');
  const settings = db
    .prepare('SELECT key, value_json, updated_at FROM app_settings ORDER BY key ASC')
    .all();
  console.table(settings);

  console.log('\n=== SEEDED TAX_RATE_PROFILES ===');
  const rates = db
    .prepare(
      'SELECT id, name, rate_bps, effective_from, effective_to, is_active, notes FROM tax_rate_profiles ORDER BY rate_bps ASC',
    )
    .all();
  console.table(rates);

  console.log('\n=== SEEDED STATES (FULL 40 ENTRIES) ===');
  const states = db
    .prepare('SELECT code, name, is_union_territory, is_active FROM states ORDER BY code ASC')
    .all();
  console.table(states);

  console.log('\n=== ACCEPTANCE CRITERION 7: APPEND-ONLY TRIGGER ERRORS ===');
  db.prepare(
    `
    INSERT INTO audit_log (id, entity_table, entity_id, action, created_at)
    VALUES ('audit-test-1', 'app_settings', 'rounding.rule', 'SETTING_CHANGE', '2026-08-25T12:00:00.000Z')
  `,
  ).run();

  try {
    db.prepare("UPDATE audit_log SET reason = 'tampered' WHERE id = 'audit-test-1'").run();
  } catch (err) {
    console.log('UPDATE trigger error verbatim:');
    console.log(err.message);
  }

  try {
    db.prepare("DELETE FROM audit_log WHERE id = 'audit-test-1'").run();
  } catch (err) {
    console.log('DELETE trigger error verbatim:');
    console.log(err.message);
  }

  console.log(
    '\n=== ACCEPTANCE CRITERION 9: ROUNDING RULE CHANGING BEHAVIOUR WITH NO CODE CHANGE ===',
  );
  const repo = new SettingsRepository(db);
  const initialRule = repo.getRoundingRule();
  const resDown = roundToRupee(paise(12350n), initialRule);
  console.log(`Initial DB setting 'rounding.rule': "${initialRule}"`);
  console.log(
    `roundToRupee(123.50, "${initialRule}") = ₹${Number(resDown) / 100} (${resDown} paise)`,
  );

  repo.setRoundingRule('HALF_UP', 'Switching to Section 170 CGST rule');
  const updatedRule = repo.getRoundingRule();
  const resUp = roundToRupee(paise(12350n), updatedRule);
  console.log(`Updated DB setting 'rounding.rule': "${updatedRule}"`);
  console.log(`roundToRupee(123.50, "${updatedRule}") = ₹${Number(resUp) / 100} (${resUp} paise)`);

  console.log('\n=== ACCEPTANCE CRITERION 8: CHECKSUM REFUSAL ERROR ===');
  const tamperedMigDir = path.join(tempDir, 'tampered-migrations');
  fs.mkdirSync(tamperedMigDir, { recursive: true });
  fs.writeFileSync(
    path.join(tamperedMigDir, '0001_foundation.sql'),
    '-- tampered migration content',
    'utf8',
  );
  try {
    await runMigrations(db, { migrationsDir: tamperedMigDir });
  } catch (err) {
    console.log('Checksum refusal error verbatim:');
    console.log(err.message);
  }
}

inspect();
