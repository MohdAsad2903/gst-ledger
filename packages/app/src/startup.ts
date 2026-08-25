import path from 'node:path';
import type Database from 'better-sqlite3';
import {
  openDatabase,
  runMigrations,
  getHealth,
  BackupService,
  SettingsRepository,
  type DatabaseHealth,
} from '@gst/data';
import type { Logger } from './logger.js';

export interface StartupContext {
  db: Database.Database;
  backupService: BackupService;
  settingsRepo: SettingsRepository;
  health: DatabaseHealth;
  databasePath: string;
  backupDirectory: string;
}

export interface StartupStepProgress {
  step: string;
  detail?: string;
}

/**
 * Executes the full startup sequence in strict, deterministic order.
 *
 * Sequence:
 * 1. Open SQLite database connection & verify mandatory pragmas.
 * 2. Run PRAGMA integrity_check.
 * 3. Initialize BackupService.
 * 4. Run pending migrations with automatic PRE_MIGRATION backup hook.
 * 5. Run live health check.
 */
export async function runStartupSequence(params: {
  userDataPath: string;
  logsDir: string;
  logger: Logger;
  onProgress?: (progress: StartupStepProgress) => void;
}): Promise<StartupContext> {
  const { userDataPath, logger, onProgress } = params;

  const databasePath = path.join(userDataPath, 'gst-ledger.sqlite');
  const backupDirectory = path.join(userDataPath, 'backups');

  // Step 1: Open database and verify pragmas
  onProgress?.({ step: 'DATABASE_OPEN', detail: 'Opening database and verifying pragmas' });
  logger.info('Opening database connection', { path: databasePath });

  let db: Database.Database;
  try {
    db = openDatabase(databasePath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Failed to open database connection', { error: msg, path: databasePath });
    throw new Error(`Database connection failed: ${msg}`);
  }

  // Step 2: PRAGMA integrity_check
  onProgress?.({ step: 'INTEGRITY_CHECK', detail: 'Verifying database integrity' });
  try {
    const integrity = db.pragma('integrity_check', { simple: true }) as string;
    if (integrity !== 'ok') {
      throw new Error(`Database integrity check failed: ${integrity}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Database integrity verification failed', { error: msg, path: databasePath });
    try {
      db.close();
    } catch {
      // ignore
    }
    throw new Error(`Database integrity verification failed (${databasePath}): ${msg}`);
  }

  // Step 3: Initialize BackupService and SettingsRepository
  const settingsRepo = new SettingsRepository(db);
  const backupService = new BackupService({
    db,
    backupDir: backupDirectory,
    settingsRepo,
    logger: {
      info: (msg, meta) => logger.info(msg, meta),
      warn: (msg, meta) => logger.warn(msg, meta),
      error: (msg, meta) => logger.error(msg, meta),
      debug: (msg, meta) => logger.debug(msg, meta),
    },
  });

  // Step 4: Run pending migrations with PRE_MIGRATION backup hook
  onProgress?.({ step: 'MIGRATIONS', detail: 'Running database migrations' });
  try {
    const migResult = await runMigrations(db, {
      beforeMigrate: async pending => {
        logger.info(`Running pre-migration backup for ${pending.length} pending migrations`);
        const bkRes = await backupService.createBackup(
          'PRE_MIGRATION',
          `Automated pre-migration snapshot before ${pending[0]?.filename}`,
        );
        if (!bkRes.ok) {
          throw new Error(`Pre-migration backup failed: ${bkRes.error}. Migrations aborted.`);
        }
      },
    });

    if (migResult.appliedCount > 0) {
      logger.info(`Applied ${migResult.appliedCount} migrations. New version: ${migResult.currentVersion}`);
    } else {
      logger.info(`Schema current at version ${migResult.currentVersion}. No pending migrations.`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Database migration failed', { error: msg });
    try {
      db.close();
    } catch {
      // ignore
    }
    throw new Error(`Migration runner failed: ${msg}`);
  }

  // Step 5: Final health check
  onProgress?.({ step: 'HEALTH_CHECK', detail: 'Performing startup health check' });
  const health = getHealth(db);
  if (!health.ok) {
    logger.error('Startup health check failed', { health });
    try {
      db.close();
    } catch {
      // ignore
    }
    throw new Error('Database health check failed after startup sequence');
  }

  logger.info('Startup sequence completed successfully', {
    schemaVersion: health.ok ? 2 : 0,
    journalMode: health.journalMode,
    foreignKeys: health.foreignKeys,
  });

  return {
    db,
    backupService,
    settingsRepo,
    health,
    databasePath,
    backupDirectory,
  };
}
