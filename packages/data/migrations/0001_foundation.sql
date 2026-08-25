-- Migration 0001: Foundation Tables & Audit Triggers
-- Creates the initial six foundation tables for GST Ledger

-- 1. Schema Migrations (Forward-only, checksum verified)
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  checksum TEXT NOT NULL
);

-- 2. Application Settings (Key-value with audit logging)
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 3. States Master (Indian GST state codes 01-38, 96, 97)
CREATE TABLE IF NOT EXISTS states (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_union_territory INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);

-- 4. Tax Rate Profiles (Configurable GST rate slabs)
CREATE TABLE IF NOT EXISTS tax_rate_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  rate_bps INTEGER NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to TEXT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  notes TEXT NULL
);

-- 5. Audit Log (Append-only record of all entity mutations)
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  entity_table TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN (
    'CREATE', 'UPDATE', 'DELETE', 'CANCEL', 'RESTORE',
    'PERIOD_CLOSE', 'PERIOD_REOPEN', 'SETTING_CHANGE'
  )),
  before_json TEXT NULL,
  after_json TEXT NULL,
  reason TEXT NULL,
  actor TEXT NOT NULL DEFAULT 'local',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_table, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);

-- Append-only trigger constraints on audit_log
CREATE TRIGGER IF NOT EXISTS audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;

CREATE TRIGGER IF NOT EXISTS audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;

-- 6. Backups Record (Populated in Part 1D)
CREATE TABLE IF NOT EXISTS backups (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  trigger TEXT NOT NULL CHECK (trigger IN ('MANUAL', 'APP_CLOSE', 'PRE_MIGRATION')),
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
