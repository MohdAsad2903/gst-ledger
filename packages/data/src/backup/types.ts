import type Database from 'better-sqlite3';
import type { SettingsRepository } from '../repositories/settings.repository.js';

export type BackupTrigger = 'MANUAL' | 'APP_CLOSE' | 'PRE_MIGRATION';

export type BackupStatus = 'OK' | 'FILE_MISSING' | 'HASH_MISMATCH' | 'INTEGRITY_FAILED';

export type BackupError =
  'DISK_FULL' | 'DIRECTORY_NOT_WRITABLE' | 'INTEGRITY_FAILED' | 'BACKUP_FAILED' | 'NOT_FOUND';

export interface BackupRecord {
  id: string;
  filePath: string;
  sizeBytes: number;
  sha256: string;
  trigger: BackupTrigger;
  schemaVersion: number;
  createdAt: string;
}

export interface VerifyReport {
  status: BackupStatus;
  id: string;
  filePath: string;
  expectedSha256: string;
  actualSha256?: string;
  integrityCheck?: string;
  message: string;
}

export interface LoggerInterface {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug?(message: string, meta?: Record<string, unknown>): void;
}

export interface BackupServiceOptions {
  db: Database.Database;
  backupDir?: string;
  settingsRepo?: SettingsRepository;
  logger?: LoggerInterface;
}
