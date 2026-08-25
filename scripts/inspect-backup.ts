import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import {
  openDatabase,
  runMigrations,
  BackupService,
  SettingsRepository,
} from '../packages/data/src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runBackupAcceptance() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gst-backup-inspect-'));
  const dbPath = path.join(tempDir, 'live-ledger.sqlite');
  const backupDir = path.join(tempDir, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });

  const db = openDatabase(dbPath);
  const settingsRepo = new SettingsRepository(db);

  const logs: string[] = [];
  const mockLogger = {
    info: (msg: string, meta?: any) =>
      logs.push(`[INFO] ${msg} ${meta ? JSON.stringify(meta) : ''}`),
    warn: (msg: string, meta?: any) =>
      logs.push(`[WARN] ${msg} ${meta ? JSON.stringify(meta) : ''}`),
    error: (msg: string, meta?: any) =>
      logs.push(`[ERROR] ${msg} ${meta ? JSON.stringify(meta) : ''}`),
  };

  const backupService = new BackupService({
    db,
    backupDir,
    settingsRepo,
    logger: mockLogger,
  });

  console.log('=== 1. STARTUP LOG: PRE_MIGRATION BACKUP PRECEDING MIGRATIONS ===');
  await runMigrations(db, {
    migrationsDir: path.resolve(__dirname, '../packages/data/migrations'),
    beforeMigrate: async pending => {
      mockLogger.info(
        `Executing automatic pre-migration backup for ${pending.length} pending migrations`,
      );
      await backupService.createBackup('PRE_MIGRATION', 'Automated pre-migration snapshot');
    },
  });
  logs.forEach(l => console.log(l));

  console.log('\n=== 2. CREATING SECOND BACKUP (MANUAL) ===');
  await backupService.createBackup('MANUAL', 'User triggered backup');

  console.log('\n=== 3. DIRECTORY LISTING OF BACKUPS FOLDER ===');
  const files = fs.readdirSync(backupDir);
  const fileDetails = files.map(f => {
    const stat = fs.statSync(path.join(backupDir, f));
    return {
      filename: f,
      sizeBytes: stat.size,
      modified: stat.mtime.toISOString(),
    };
  });
  console.table(fileDetails);

  console.log('\n=== 4. BACKUPS TABLE ROWS (SELECT * FROM backups) ===');
  const backupRows = db.prepare('SELECT * FROM backups ORDER BY created_at ASC').all();
  console.table(backupRows);

  console.log('\n=== 5. EVIDENCE FOR CRITERION 6: WAL CHECKPOINT COMMITTED TRANSACTION PROOF ===');
  settingsRepo.set('org.businessProof', 'AM_MACHINE_TOOLS_GZB_REGISTER_2026');
  const crit6BackupRes = await backupService.createBackup(
    'MANUAL',
    'Proving WAL checkpoint commits',
  );
  if (crit6BackupRes.ok) {
    const backupDb = new Database(crit6BackupRes.value.filePath, { readonly: true });
    const row = backupDb
      .prepare(
        "SELECT key, value_json, updated_at FROM app_settings WHERE key = 'org.businessProof'",
      )
      .get();
    console.log('Queried backup file directly (read-only):');
    console.table([row]);
    backupDb.close();
  }

  console.log('\n=== 6. ERROR OUTPUT FROM CRITERIA 4, 5, AND 7 (VERBATIM) ===');
  const testBk = await backupService.createBackup('MANUAL', 'Verification test backup');
  if (testBk.ok) {
    // Criterion 4: Deleted/missing file
    const targetFile = testBk.value.filePath;
    fs.unlinkSync(targetFile);
    const rep4 = await backupService.verifyBackup(testBk.value.id);
    console.log('Criterion 4 (FILE_MISSING) output:');
    console.log(JSON.stringify(rep4, null, 2));

    // Re-create backup for Criterion 5
    const testBk5 = await backupService.createBackup('MANUAL', 'Checksum mismatch test backup');
    if (testBk5.ok) {
      fs.appendFileSync(testBk5.value.filePath, 'X');
      const rep5 = await backupService.verifyBackup(testBk5.value.id);
      console.log('\nCriterion 5 (HASH_MISMATCH) output:');
      console.log(JSON.stringify(rep5, null, 2));
    }
  }

  // Criterion 7: Read-only / invalid directory
  const failingService = new BackupService({
    db,
    backupDir: path.join(tempDir, 'invalid\0readonly/path'),
    settingsRepo,
    logger: mockLogger,
  });
  const rep7 = await failingService.createBackup('PRE_MIGRATION');
  console.log('\nCriterion 7 (DIRECTORY_NOT_WRITABLE) output:');
  console.log(JSON.stringify(rep7, null, 2));

  console.log('\n=== 7. RETENTION TEST FROM CRITERION 8 (3 NEWEST + LAST OF OLD MONTH) ===');
  settingsRepo.set('backup.retainCount', 3);
  db.prepare('DELETE FROM backups').run();

  const sim = (id: string, dateIso: string) => {
    const dest = path.join(backupDir, `gst-sim-${id}.sqlite`);
    fs.copyFileSync(dbPath, dest);
    db.prepare(
      `
      INSERT INTO backups (id, file_path, size_bytes, sha256, trigger, schema_version, created_at)
      VALUES (?, ?, ?, ?, 'MANUAL', 2, ?)
    `,
    ).run(id, dest, 1024, 'dummy-hash', dateIso);
  };

  sim('B1_Jul01', '2026-07-01T10:00:00.000Z');
  sim('B2_Jul20', '2026-07-20T10:00:00.000Z'); // Latest of July (Protected!)
  sim('B3_Aug01', '2026-08-01T10:00:00.000Z');
  sim('B4_Aug02', '2026-08-02T10:00:00.000Z');
  sim('B5_Aug03', '2026-08-03T10:00:00.000Z'); // Latest overall (Protected!)

  const pruneReport = await backupService.pruneBackups();
  console.log('Kept backups:');
  console.table(pruneReport.kept.map(k => ({ id: k.id, createdAt: k.createdAt })));
  console.log('Pruned (deleted) backups:');
  console.table(pruneReport.deleted.map(d => ({ id: d.id, createdAt: d.createdAt })));

  console.log('\n=== 8. TIMING BENCHMARKS ===');
  // Empty database backup time
  const t0 = Date.now();
  await backupService.createBackup('MANUAL');
  const durEmpty = Date.now() - t0;
  console.log(`Empty/Foundation database backup duration: ${durEmpty}ms`);

  // Seed 10,000 synthetic rows into audit_log
  const insertStmt = db.prepare(`
    INSERT INTO audit_log (id, entity_table, entity_id, action, created_at)
    VALUES (?, 'synthetic_table', 'row-1', 'CREATE', '2026-08-25T12:00:00.000Z')
  `);
  db.transaction(() => {
    for (let i = 0; i < 10000; i++) {
      insertStmt.run(`syn-bench-${i}`);
    }
  })();

  const t1 = Date.now();
  const res10k = await backupService.createBackup('MANUAL', '10,000 synthetic rows scale test');
  const dur10k = Date.now() - t1;
  console.log(
    `10,000 synthetic rows database backup duration: ${dur10k}ms (size: ${res10k.ok ? res10k.value.sizeBytes : 0} bytes)`,
  );

  db.close();
}

runBackupAcceptance();
