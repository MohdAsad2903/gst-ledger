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
  varianceInfoPaise: number;
  varianceWarnPaise: number;
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
  totalAmount: string; // as typed by user, e.g. "141542" or "1,41,542.00"
  gstAmount: string; // as typed by user, e.g. "21591" or "21,591.00"
  rateBps: number; // from the rate dropdown, e.g. 1800
  counterpartyStateCode: string; // from the state dropdown, e.g. "09" or "07"
}

export interface CalcDemoResult {
  parsed: {
    total?: string;
    tax?: string;
    errors: ValidationIssue[];
  };
  taxableAmount: string | null; // e.g. "₹1,19,951.00"
  enteredTax: string | null; // e.g. "₹21,591.00"
  expectedTax: string | null; // e.g. "₹21,591.00"
  variance: string | null; // e.g. "₹0.00" or "-₹1.00"
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

export interface IpcContract {
  'system:getHealth': () => Promise<SystemHealth>;
  'system:getSettings': () => Promise<AppSettingsSnapshot>;
  'system:setSetting': (key: string, value: unknown) => Promise<Result<void, string>>;
  'backup:list': () => Promise<BackupRecordDTO[]>;
  'backup:create': () => Promise<Result<BackupRecordDTO, string>>;
  'backup:verify': (id: string) => Promise<Result<VerifyReportDTO, string>>;
  'masters:getStates': () => Promise<StateRow[]>;
  'masters:getRates': () => Promise<TaxRateProfileRow[]>;
  'calc:demo': (input: CalcDemoInput) => Promise<CalcDemoResult>;
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
