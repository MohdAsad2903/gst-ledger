import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

/**
 * 1. Schema Migrations table
 */
export const schemaMigrations = sqliteTable('schema_migrations', {
  version: integer('version').primaryKey(),
  name: text('name').notNull(),
  appliedAt: text('applied_at').notNull(),
  checksum: text('checksum').notNull(),
});

/**
 * 2. Application Settings table
 */
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  valueJson: text('value_json').notNull(),
  updatedAt: text('updated_at').notNull(),
});

/**
 * 3. States master table
 */
export const states = sqliteTable('states', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  isUnionTerritory: integer('is_union_territory').notNull().default(0),
  isActive: integer('is_active').notNull().default(1),
});

/**
 * 4. Tax Rate Profiles table
 */
export const taxRateProfiles = sqliteTable('tax_rate_profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  rateBps: integer('rate_bps').notNull(),
  effectiveFrom: text('effective_from').notNull(),
  effectiveTo: text('effective_to'),
  isActive: integer('is_active').notNull().default(1),
  notes: text('notes'),
});

/**
 * 5. Audit Log table (Append-only)
 */
export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    entityTable: text('entity_table').notNull(),
    entityId: text('entity_id').notNull(),
    action: text('action').notNull(),
    beforeJson: text('before_json'),
    afterJson: text('after_json'),
    reason: text('reason'),
    actor: text('actor').notNull().default('local'),
    createdAt: text('created_at').notNull(),
  },
  table => [
    index('idx_audit_log_entity').on(table.entityTable, table.entityId),
    index('idx_audit_log_created_at').on(table.createdAt),
  ],
);

/**
 * 6. Backups record table
 */
export const backups = sqliteTable('backups', {
  id: text('id').primaryKey(),
  filePath: text('file_path').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  sha256: text('sha256').notNull(),
  trigger: text('trigger').notNull(),
  schemaVersion: integer('schema_version').notNull(),
  createdAt: text('created_at').notNull(),
});

export type SchemaMigration = typeof schemaMigrations.$inferSelect;
export type AppSetting = typeof appSettings.$inferSelect;
export type State = typeof states.$inferSelect;
export type TaxRateProfile = typeof taxRateProfiles.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type BackupRecord = typeof backups.$inferSelect;
