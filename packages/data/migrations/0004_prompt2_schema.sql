-- 0004_prompt2_schema.sql
-- Migration 4: Org units, parties, periods, opening credits, bills, and bill tax lines

CREATE TABLE IF NOT EXISTS org_units (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  gstin TEXT NOT NULL,
  state_code TEXT NOT NULL REFERENCES states(code),
  address_line TEXT,
  city TEXT,
  pincode TEXT,
  invoice_series_label TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  row_version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS parties (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  display_name_norm TEXT NOT NULL,
  legal_name TEXT,
  gstin TEXT,
  gstin_verified INTEGER NOT NULL DEFAULT 0,
  state_code TEXT NOT NULL REFERENCES states(code),
  address_line TEXT,
  city TEXT,
  pincode TEXT,
  phone TEXT,
  is_supplier INTEGER NOT NULL DEFAULT 0,
  is_customer INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  row_version INTEGER NOT NULL DEFAULT 1,
  CHECK (is_supplier = 1 OR is_customer = 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_parties_gstin ON parties (gstin)
  WHERE deleted_at IS NULL AND gstin IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_parties_display_name_norm ON parties (display_name_norm)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS periods (
  id TEXT PRIMARY KEY,
  financial_year TEXT NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  closed_by TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  row_version INTEGER NOT NULL DEFAULT 1,
  UNIQUE (year, month),
  CHECK (month BETWEEN 1 AND 12),
  CHECK (status IN ('OPEN', 'CLOSED'))
);

CREATE TABLE IF NOT EXISTS period_opening_credits (
  id TEXT PRIMARY KEY,
  period_id TEXT NOT NULL UNIQUE REFERENCES periods(id),
  amount_paise INTEGER NOT NULL DEFAULT 0,
  source_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  row_version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS bills (
  id TEXT PRIMARY KEY,
  direction TEXT NOT NULL,
  period_id TEXT NOT NULL REFERENCES periods(id),
  org_unit_id TEXT REFERENCES org_units(id),
  party_id TEXT REFERENCES parties(id),
  bill_number TEXT NOT NULL,
  bill_number_norm TEXT NOT NULL,
  bill_date TEXT NOT NULL,
  received_date TEXT,
  financial_year TEXT NOT NULL,
  place_of_supply_state_code TEXT NOT NULL REFERENCES states(code),
  supply_type TEXT NOT NULL,
  supply_type_override_reason TEXT,
  total_amount_paise INTEGER NOT NULL,
  tax_amount_paise INTEGER NOT NULL,
  taxable_amount_paise INTEGER NOT NULL,
  cgst_paise INTEGER NOT NULL DEFAULT 0,
  sgst_paise INTEGER NOT NULL DEFAULT 0,
  igst_paise INTEGER NOT NULL DEFAULT 0,
  cess_paise INTEGER NOT NULL DEFAULT 0,
  primary_rate_bps INTEGER,
  is_multi_rate INTEGER NOT NULL DEFAULT 0,
  tax_variance_paise INTEGER NOT NULL DEFAULT 0,
  split_flags TEXT,
  variance_note TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  cancellation_reason TEXT,
  payment_status TEXT NOT NULL DEFAULT 'UNKNOWN',
  payment_note TEXT,
  itc_status TEXT NOT NULL DEFAULT 'NOT_TRACKED',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  row_version INTEGER NOT NULL DEFAULT 1,

  CHECK (direction IN ('PURCHASE','SALE')),
  CHECK (status IN ('ACTIVE','CANCELLED')),
  CHECK (supply_type IN ('INTRA','INTER')),
  CHECK (total_amount_paise >= 0),
  CHECK (tax_amount_paise >= 0),
  CHECK (tax_amount_paise <= total_amount_paise),
  CHECK (taxable_amount_paise = total_amount_paise - tax_amount_paise),
  CHECK (cgst_paise >= 0 AND sgst_paise >= 0 AND igst_paise >= 0 AND cess_paise >= 0),
  CHECK (cgst_paise + sgst_paise + igst_paise = tax_amount_paise),
  CHECK (supply_type <> 'INTER' OR (cgst_paise = 0 AND sgst_paise = 0)),
  CHECK (supply_type <> 'INTRA' OR igst_paise = 0),
  CHECK (direction <> 'SALE' OR org_unit_id IS NOT NULL),
  CHECK (direction <> 'PURCHASE' OR party_id IS NOT NULL),
  CHECK (status <> 'ACTIVE' OR total_amount_paise > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bills_dup_purchase ON bills
  (party_id, bill_number_norm, financial_year)
  WHERE deleted_at IS NULL AND direction = 'PURCHASE';

CREATE UNIQUE INDEX IF NOT EXISTS idx_bills_dup_sale ON bills
  (org_unit_id, bill_number_norm, financial_year)
  WHERE deleted_at IS NULL AND direction = 'SALE';

CREATE INDEX IF NOT EXISTS idx_bills_period_dir ON bills (period_id, direction);
CREATE INDEX IF NOT EXISTS idx_bills_party_date ON bills (party_id, bill_date);
CREATE INDEX IF NOT EXISTS idx_bills_date ON bills (bill_date);
CREATE INDEX IF NOT EXISTS idx_bills_number_norm ON bills (bill_number_norm);
CREATE INDEX IF NOT EXISTS idx_bills_dir_status ON bills (direction, status);
CREATE INDEX IF NOT EXISTS idx_bills_fy_dir ON bills (financial_year, direction);
CREATE INDEX IF NOT EXISTS idx_bills_unit_dir_date ON bills (org_unit_id, direction, bill_date);

CREATE TABLE IF NOT EXISTS bill_tax_lines (
  id TEXT PRIMARY KEY,
  bill_id TEXT NOT NULL REFERENCES bills(id),
  line_no INTEGER NOT NULL,
  rate_bps INTEGER NOT NULL,
  taxable_paise INTEGER NOT NULL,
  cgst_paise INTEGER NOT NULL DEFAULT 0,
  sgst_paise INTEGER NOT NULL DEFAULT 0,
  igst_paise INTEGER NOT NULL DEFAULT 0,
  cess_paise INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  row_version INTEGER NOT NULL DEFAULT 1,
  UNIQUE (bill_id, line_no)
);
