/**
 * @gst/data
 *
 * Persistence, migrations, backup service, and audit infrastructure for GST Ledger.
 */

// Database connection & health
export {
  openDatabase,
  applyAndVerifyPragmas,
  createDrizzleDb,
  getHealth,
  type AppDatabase,
  type DatabaseHealth,
} from './db/connection.js';

// Drizzle schema & inferred types
export {
  schemaMigrations,
  appSettings,
  states,
  taxRateProfiles,
  auditLog,
  backups,
  type SchemaMigration,
  type AppSetting,
  type State,
  type TaxRateProfile,
  type AuditLogEntry,
  type BackupRecord as SchemaBackupRecord,
} from './db/schema.js';

// Migration runner
export {
  runMigrations,
  getPendingMigrations,
  getAppliedMigrations,
  getCurrentSchemaVersion,
  loadMigrationFiles,
  computeFileChecksum,
  getDefaultMigrationsDir,
  type MigrationFile,
  type AppliedMigration,
  type MigrationOptions,
  type MigrationResult,
} from './migrations/runner.js';

// Repositories & Audit
export { withAudit, type AuditAction, type AuditParams } from './repositories/audit.js';

export { SettingsRepository, type AppSettingsMap } from './repositories/settings.repository.js';

// Backup Service
export { BackupService } from './backup/service.js';

export type {
  BackupTrigger,
  BackupStatus,
  BackupError,
  BackupRecord,
  VerifyReport,
  BackupServiceOptions,
  LoggerInterface,
} from './backup/types.js';
