import { describe, it, expect } from 'vitest';
import * as Data from './index.js';

describe('packages/data barrel export', () => {
  it('exports all expected database and repository functions', () => {
    expect(typeof Data.openDatabase).toBe('function');
    expect(typeof Data.applyAndVerifyPragmas).toBe('function');
    expect(typeof Data.createDrizzleDb).toBe('function');
    expect(typeof Data.getHealth).toBe('function');
    expect(typeof Data.runMigrations).toBe('function');
    expect(typeof Data.getCurrentSchemaVersion).toBe('function');
    expect(typeof Data.getPendingMigrations).toBe('function');
    expect(typeof Data.withAudit).toBe('function');
    expect(typeof Data.SettingsRepository).toBe('function');

    expect(Data.schemaMigrations).toBeDefined();
    expect(Data.appSettings).toBeDefined();
    expect(Data.states).toBeDefined();
    expect(Data.taxRateProfiles).toBeDefined();
    expect(Data.auditLog).toBeDefined();
    expect(Data.backups).toBeDefined();
  });
});
