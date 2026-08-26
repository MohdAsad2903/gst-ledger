import type Database from 'better-sqlite3';
import { ipcMain } from 'electron';
import fs from 'node:fs';
import {
  parseAmountToPaise,
  paiseToDecimalString,
  messageForAmountError,
  expectedTaxPaise,
  taxVariancePaise,
  varianceSeverity,
  classifySupply,
  splitTax,
  validateBillAmounts,
  paise,
  type ValidationIssue,
} from '@gst/core';
import {
  getHealth,
  getCurrentSchemaVersion,
  getPendingMigrations,
  type BackupService,
  type SettingsRepository,
} from '@gst/data';
import type {
  CalcDemoInput,
  CalcDemoResult,
  SystemHealth,
  AppSettingsSnapshot,
  StateRow,
  TaxRateProfileRow,
  IpcContract,
} from './contract.js';
import type { Logger } from '../logger.js';

export interface AppInfoContext {
  appVersion: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
  platform: string;
  userDataPath: string;
  logsDir: string;
  databasePath: string;
}

/**
 * Type-safe helper to register an IPC handler against IpcContract.
 * Typo in channel name or mismatched parameters/return causes a compile error.
 */
function handle<K extends keyof IpcContract>(
  channel: K,
  fn: (...args: Parameters<IpcContract[K]>) => ReturnType<IpcContract[K]>,
): void {
  ipcMain.handle(channel, (_event, ...args) => fn(...(args as Parameters<IpcContract[K]>)));
}

/**
 * Handles calc:demo calculation requests from the renderer.
 *
 * CRITICAL ARCHITECTURAL REQUIREMENT:
 * Reads `rounding.rule` from app_settings directly per invocation.
 * Never caches the rule at startup so database setting changes reflect immediately.
 *
 * Defect 4: Monetary amounts cross IPC strictly as plain decimal strings (e.g. "119951.00"),
 * never display strings with commas or rupee symbols.
 */
export function handleCalcDemo(
  input: CalcDemoInput,
  settingsRepo: SettingsRepository,
): CalcDemoResult {
  // 1. Read rounding rule live from database configuration
  const roundingRule = settingsRepo.getRoundingRule();
  const ourStateCode = settingsRepo.getDefaultStateCode();
  const thresholds = settingsRepo.getVarianceThresholds();

  const issues: ValidationIssue[] = [];

  const rawTotal = input.totalAmount?.trim() ?? '';
  const rawTax = input.gstAmount?.trim() ?? '';

  // If both are empty, return blank cleanly with no aggressive error shouting
  if (rawTotal.length === 0 && rawTax.length === 0) {
    return {
      parsed: { errors: [] },
      taxableAmount: null,
      enteredTax: null,
      expectedTax: null,
      variance: null,
      varianceSeverity: 'NONE',
      supplyType: null,
      split: null,
      roundingRuleUsed: roundingRule,
      issues: [],
    };
  }

  // 2. Parse amounts using core string-based parser
  const parsedTotal = parseAmountToPaise(rawTotal);
  const parsedTax = parseAmountToPaise(rawTax);

  // Defect 6: Plain-language error messages
  if (!parsedTotal.ok) {
    issues.push({
      code: `TOTAL_${parsedTotal.error}`,
      severity: 'BLOCK',
      field: 'total',
      message: messageForAmountError(parsedTotal.error, 'total'),
    });
  }

  if (!parsedTax.ok) {
    issues.push({
      code: `TAX_${parsedTax.error}`,
      severity: 'BLOCK',
      field: 'tax',
      message: messageForAmountError(parsedTax.error, 'tax'),
    });
  }

  if (!parsedTotal.ok || !parsedTax.ok) {
    return {
      parsed: {
        total: parsedTotal.ok ? paiseToDecimalString(parsedTotal.value) : undefined,
        tax: parsedTax.ok ? paiseToDecimalString(parsedTax.value) : undefined,
        errors: issues,
      },
      taxableAmount: null,
      enteredTax: null,
      expectedTax: null,
      variance: null,
      varianceSeverity: 'NONE',
      supplyType: null,
      split: null,
      roundingRuleUsed: roundingRule,
      issues,
    };
  }

  const totalPaise = parsedTotal.value;
  const taxPaise = parsedTax.value;
  const rateBps = BigInt(Math.max(0, input.rateBps || 0));

  // 3. Bill Amount (taxable) = Total Amount - GST Amount
  const taxablePaise = paise(totalPaise - taxPaise);

  // 4. Validate monetary relationships
  const validationIssues = validateBillAmounts({
    totalPaise,
    taxPaise,
    status: 'ACTIVE',
    suppliedRatesBps: [rateBps],
  });
  issues.push(...validationIssues);

  const hasBlockingIssue = issues.some(i => i.severity === 'BLOCK');
  if (hasBlockingIssue || taxablePaise < 0n) {
    return {
      parsed: {
        total: paiseToDecimalString(totalPaise),
        tax: paiseToDecimalString(taxPaise),
        errors: issues,
      },
      taxableAmount: null,
      enteredTax: paiseToDecimalString(taxPaise),
      expectedTax: null,
      variance: null,
      varianceSeverity: 'NONE',
      supplyType: null,
      split: null,
      roundingRuleUsed: roundingRule,
      issues,
    };
  }

  // 5. Expected GST and Variance calculation
  const expectedPaise = expectedTaxPaise(taxablePaise, rateBps, roundingRule);
  const variancePaise = taxVariancePaise(taxPaise, taxablePaise, rateBps, roundingRule);
  const severity = varianceSeverity(variancePaise, thresholds);

  // 6. Supply Classification (INTRA / INTER)
  const classification = classifySupply({
    counterpartyStateCode: input.counterpartyStateCode || ourStateCode,
    ourStateCode,
  });

  const supplyType = classification.ok ? classification.value : 'INTRA';

  // 7. Split Tax between CGST, SGST, IGST
  const split = splitTax({
    supplyType,
    totalTax: taxPaise,
    taxable: taxablePaise,
    rateBps,
    rule: roundingRule,
  });

  return {
    parsed: {
      total: paiseToDecimalString(totalPaise),
      tax: paiseToDecimalString(taxPaise),
      errors: [],
    },
    taxableAmount: paiseToDecimalString(taxablePaise),
    enteredTax: paiseToDecimalString(taxPaise),
    expectedTax: paiseToDecimalString(expectedPaise),
    variance: paiseToDecimalString(variancePaise),
    varianceSeverity: severity,
    supplyType,
    split: {
      cgst: paiseToDecimalString(split.cgst),
      sgst: paiseToDecimalString(split.sgst),
      igst: paiseToDecimalString(split.igst),
      flags: split.flags,
    },
    roundingRuleUsed: roundingRule,
    issues,
  };
}

/**
 * Registers all typed IPC handlers on ipcMain via type-checked handle helper.
 */
export function registerIpcHandlers(params: {
  db: Database.Database;
  backupService: BackupService;
  settingsRepo: SettingsRepository;
  logger: Logger;
  appInfo: AppInfoContext;
}): void {
  const { db, backupService, settingsRepo, logger, appInfo } = params;

  // 1. system:getHealth
  handle('system:getHealth', async (): Promise<SystemHealth> => {
    try {
      const dbHealth = getHealth(db);
      const currentVersion = getCurrentSchemaVersion(db);
      const pendingMigrations = getPendingMigrations(db);

      let dbSize = 0;
      if (fs.existsSync(appInfo.databasePath)) {
        dbSize = fs.statSync(appInfo.databasePath).size;
      }

      const countStates =
        (db.prepare('SELECT COUNT(*) as c FROM states').get() as { c: number })?.c ?? 0;
      const countRates =
        (db.prepare('SELECT COUNT(*) as c FROM tax_rate_profiles').get() as { c: number })?.c ?? 0;
      const countSettings =
        (db.prepare('SELECT COUNT(*) as c FROM app_settings').get() as { c: number })?.c ?? 0;
      const countAudit =
        (db.prepare('SELECT COUNT(*) as c FROM audit_log').get() as { c: number })?.c ?? 0;

      return {
        ok: dbHealth.ok,
        appVersion: appInfo.appVersion,
        electronVersion: appInfo.electronVersion,
        chromeVersion: appInfo.chromeVersion,
        nodeVersion: appInfo.nodeVersion,
        platform: appInfo.platform,
        userDataPath: appInfo.userDataPath,
        logsDir: appInfo.logsDir,
        databasePath: appInfo.databasePath,
        databaseSizeBytes: dbSize,
        schemaVersion: currentVersion,
        pendingMigrationsCount: pendingMigrations.length,
        journalMode: dbHealth.journalMode,
        foreignKeys: dbHealth.foreignKeys,
        integrityCheck: dbHealth.integrityCheck,
        synchronous: dbHealth.synchronous,
        busyTimeout: dbHealth.busyTimeout,
        backupDirectory: backupService.getBackupDirectory(),
        seededCounts: {
          states: countStates,
          taxRateProfiles: countRates,
          appSettings: countSettings,
          auditLog: countAudit,
        },
      };
    } catch (err) {
      logger.error('Failed to get system health', { error: String(err) });
      return {
        ok: false,
        appVersion: appInfo.appVersion,
        electronVersion: appInfo.electronVersion,
        chromeVersion: appInfo.chromeVersion,
        nodeVersion: appInfo.nodeVersion,
        platform: appInfo.platform,
        userDataPath: appInfo.userDataPath,
        logsDir: appInfo.logsDir,
        databasePath: appInfo.databasePath,
        databaseSizeBytes: 0,
        schemaVersion: 0,
        pendingMigrationsCount: 0,
        journalMode: 'error',
        foreignKeys: false,
        integrityCheck: 'error',
        synchronous: 0,
        busyTimeout: 0,
        backupDirectory: backupService.getBackupDirectory(),
        seededCounts: { states: 0, taxRateProfiles: 0, appSettings: 0, auditLog: 0 },
      };
    }
  });

  // 2. system:getSettings
  handle('system:getSettings', async (): Promise<AppSettingsSnapshot> => {
    const thresholds = settingsRepo.getVarianceThresholds();
    return {
      roundingRule: settingsRepo.getRoundingRule(),
      varianceInfoPaise: paiseToDecimalString(paise(thresholds.infoPaise)),
      varianceWarnPaise: paiseToDecimalString(paise(thresholds.warnPaise)),
      defaultStateCode: settingsRepo.getDefaultStateCode(),
      backupRetainCount: settingsRepo.getBackupRetainCount(),
      backupOnAppClose: settingsRepo.getBackupOnAppClose(),
      dateFormat: settingsRepo.getDateFormat(),
      locale: settingsRepo.getLocale(),
      all: settingsRepo.getAllSettings(),
    };
  });

  // 3. system:setSetting
  handle('system:setSetting', async (key: string, value: unknown) => {
    try {
      if (typeof key !== 'string' || key.trim().length === 0) {
        return { ok: false as const, error: 'INVALID_KEY' };
      }
      settingsRepo.set(key, value, 'Updated via System Check screen');
      return { ok: true as const, value: undefined };
    } catch (err) {
      logger.error('Failed to update setting', { key, error: String(err) });
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // 4. backup:list
  handle('backup:list', async () => {
    return backupService.listBackups();
  });

  // 5. backup:create
  handle('backup:create', async () => {
    const res = await backupService.createBackup('MANUAL', 'User triggered from System Check');
    if (!res.ok) {
      return { ok: false as const, error: res.error };
    }
    return { ok: true as const, value: res.value };
  });

  // 6. backup:verify
  handle('backup:verify', async (id: string) => {
    const res = await backupService.verifyBackup(id);
    if (!res.ok) {
      return { ok: false as const, error: res.error };
    }
    return { ok: true as const, value: res.value };
  });

  // 7. masters:getStates
  handle('masters:getStates', async (): Promise<StateRow[]> => {
    const rows = db
      .prepare('SELECT code, name, is_union_territory, is_active FROM states ORDER BY code ASC')
      .all() as Array<{
      code: string;
      name: string;
      is_union_territory: number;
      is_active: number;
    }>;
    return rows.map(r => ({
      code: r.code,
      name: r.name,
      isUnionTerritory: r.is_union_territory === 1,
      isActive: r.is_active === 1,
    }));
  });

  // 8. masters:getRates
  handle('masters:getRates', async (): Promise<TaxRateProfileRow[]> => {
    const rows = db
      .prepare(
        'SELECT id, name, rate_bps, effective_from, effective_to, is_active, notes FROM tax_rate_profiles ORDER BY rate_bps ASC',
      )
      .all() as Array<{
      id: string;
      name: string;
      rate_bps: number;
      effective_from: string;
      effective_to: string | null;
      is_active: number;
      notes: string | null;
    }>;
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      rateBps: r.rate_bps,
      effectiveFrom: r.effective_from,
      effectiveTo: r.effective_to,
      isActive: r.is_active === 1,
      notes: r.notes,
    }));
  });

  // 9. calc:demo
  handle('calc:demo', async (input: CalcDemoInput): Promise<CalcDemoResult> => {
    return handleCalcDemo(input, settingsRepo);
  });
}
