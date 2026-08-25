import type Database from 'better-sqlite3';
import { paise, type Paise, type RoundingRule } from '@gst/core';
import { withAudit } from './audit.js';

export interface AppSettingsMap {
  'rounding.rule': RoundingRule;
  'tax.varianceInfoPaise': number;
  'tax.varianceWarnPaise': number;
  'org.defaultStateCode': string;
  'backup.retainCount': number;
  'backup.onAppClose': boolean;
  'ui.dateFormat': string;
  'ui.locale': string;
  [key: string]: unknown;
}

export class SettingsRepository {
  constructor(private db: Database.Database) {}

  /**
   * Retrieves a typed setting by key.
   *
   * @param key Setting key string
   * @returns Parsed JSON value or null if not found
   */
  public get<T>(key: string): T | null {
    const row = this.db.prepare('SELECT value_json FROM app_settings WHERE key = ?').get(key) as
      { value_json: string } | undefined;

    if (!row) {
      return null;
    }

    try {
      return JSON.parse(row.value_json) as T;
    } catch {
      return null;
    }
  }

  /**
   * Sets a setting with transactional audit logging (action: SETTING_CHANGE).
   *
   * @param key Setting key
   * @param value New value (serialized as JSON)
   * @param reason Optional human-readable rationale
   */
  public set<T>(key: string, value: T, reason?: string): void {
    const existing = this.get<T>(key);
    const valueJson = JSON.stringify(value);
    const updatedAt = new Date().toISOString();

    withAudit(
      this.db,
      {
        entityTable: 'app_settings',
        entityId: key,
        action: 'SETTING_CHANGE',
        before: existing,
        after: value,
        reason,
      },
      () => {
        this.db
          .prepare(
            `
            INSERT INTO app_settings (key, value_json, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
              value_json = excluded.value_json,
              updated_at = excluded.updated_at
          `,
          )
          .run(key, valueJson, updatedAt);
      },
    );
  }

  /**
   * Gets the configured RoundingRule ('HALF_DOWN' | 'HALF_UP').
   * Defaults to 'HALF_DOWN' if not configured.
   */
  public getRoundingRule(): RoundingRule {
    const val = this.get<string>('rounding.rule');
    if (val === 'HALF_UP') {
      return 'HALF_UP';
    }
    return 'HALF_DOWN';
  }

  /**
   * Updates the configured RoundingRule.
   */
  public setRoundingRule(rule: RoundingRule, reason?: string): void {
    this.set('rounding.rule', rule, reason);
  }

  /**
   * Gets tax variance thresholds returning branded Paise.
   */
  public getVarianceThresholds(): { infoPaise: Paise; warnPaise: Paise } {
    const info = this.get<number>('tax.varianceInfoPaise') ?? 200;
    const warn = this.get<number>('tax.varianceWarnPaise') ?? 10000;

    return {
      infoPaise: paise(BigInt(info)),
      warnPaise: paise(BigInt(warn)),
    };
  }

  /**
   * Gets default organization state code.
   */
  public getDefaultStateCode(): string {
    return this.get<string>('org.defaultStateCode') ?? '09';
  }

  /**
   * Gets number of backups to retain.
   */
  public getBackupRetainCount(): number {
    return this.get<number>('backup.retainCount') ?? 30;
  }

  /**
   * Gets whether backup should run on app close.
   */
  public getBackupOnAppClose(): boolean {
    return this.get<boolean>('backup.onAppClose') ?? true;
  }

  /**
   * Gets UI date format.
   */
  public getDateFormat(): string {
    return this.get<string>('ui.dateFormat') ?? 'DD/MM/YYYY';
  }

  /**
   * Gets UI locale.
   */
  public getLocale(): string {
    return this.get<string>('ui.locale') ?? 'en-IN';
  }

  /**
   * Returns all settings as a key-value record map.
   */
  public getAllSettings(): Record<string, unknown> {
    const rows = this.db
      .prepare('SELECT key, value_json FROM app_settings ORDER BY key ASC')
      .all() as Array<{ key: string; value_json: string }>;

    const result: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        result[row.key] = JSON.parse(row.value_json);
      } catch {
        result[row.key] = row.value_json;
      }
    }
    return result;
  }
}
