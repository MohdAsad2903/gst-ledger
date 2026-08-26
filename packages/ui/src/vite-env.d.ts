/// <reference types="vite/client" />

import type {
  Result,
  RoundingRule,
  VarianceSeverity,
  ValidationIssue,
} from '@gst/core';

export interface SystemHealth {
  ok: boolean;
  appVersion: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
  platform: string;
  userDataPath: string;
  logsDir: string;
  databasePath: string;
  databaseSizeBytes: number;
  schemaVersion: number;
  pendingMigrationsCount: number;
  journalMode: string;
  foreignKeys: boolean;
  integrityCheck: string;
  synchronous: number;
  busyTimeout: number;
  backupDirectory: string;
  seededCounts: {
    states: number;
    taxRateProfiles: number;
    appSettings: number;
    auditLog: number;
  };
}

export interface AppSettingsSnapshot {
  roundingRule: RoundingRule;
  varianceInfoPaise: string;
  varianceWarnPaise: string;
  defaultStateCode: string;
  backupRetainCount: number;
  backupOnAppClose: boolean;
  dateFormat: string;
  locale: string;
  all: Record<string, unknown>;
}

export interface StateRow {
  code: string;
  name: string;
  isUnionTerritory: boolean;
  isActive: boolean;
}

export interface TaxRateProfileRow {
  id: string;
  name: string;
  rateBps: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  notes: string | null;
}

export interface CalcDemoInput {
  totalAmount: string;
  gstAmount: string;
  rateBps: number;
  counterpartyStateCode: string;
}

export interface CalcDemoResult {
  parsed: {
    total?: string;
    tax?: string;
    errors: ValidationIssue[];
  };
  taxableAmount: string | null;
  enteredTax: string | null;
  expectedTax: string | null;
  variance: string | null;
  varianceSeverity: VarianceSeverity;
  supplyType: 'INTRA' | 'INTER' | null;
  split: {
    cgst: string;
    sgst: string;
    igst: string;
    flags: string[];
  } | null;
  roundingRuleUsed: RoundingRule;
  issues: ValidationIssue[];
}

export interface BackupRecordDTO {
  id: string;
  filePath: string;
  sizeBytes: number;
  sha256: string;
  trigger: 'MANUAL' | 'APP_CLOSE' | 'PRE_MIGRATION';
  schemaVersion: number;
  createdAt: string;
}

export interface VerifyReportDTO {
  status: 'OK' | 'FILE_MISSING' | 'HASH_MISMATCH' | 'INTEGRITY_FAILED';
  id: string;
  filePath: string;
  expectedSha256: string;
  actualSha256?: string;
  integrityCheck?: string;
  message: string;
}

export interface ApiClient {
  system: {
    getHealth: () => Promise<SystemHealth>;
    getSettings: () => Promise<AppSettingsSnapshot>;
    setSetting: (key: string, value: unknown) => Promise<Result<void, string>>;
  };
  backup: {
    list: () => Promise<BackupRecordDTO[]>;
    create: () => Promise<Result<BackupRecordDTO, string>>;
    verify: (id: string) => Promise<Result<VerifyReportDTO, string>>;
  };
  masters: {
    getStates: () => Promise<StateRow[]>;
    getRates: () => Promise<TaxRateProfileRow[]>;
  };
  calc: {
    demo: (input: CalcDemoInput) => Promise<CalcDemoResult>;
  };
}

declare global {
  interface Window {
    api?: ApiClient;
  }
}
