# GST Ledger — Data Layer Architecture & Schema Conventions

This document establishes the binding database and schema conventions for `@gst/data`. All foundation tables and all future business entities (bills, parties, periods, org units) must follow these rules without exception.

---

## 1. Core Principles

1. **Never Hard Delete:** Financial and audit data is permanent legal evidence. Corrections are added as new audited entries; cancellations and deletions are soft deletes via `deleted_at`.
2. **Deterministic Migrations:** Migrations are forward-only plain SQL files with SHA-256 checksum verification. An applied migration can never be modified.
3. **Integer Money Representation:** Monetary values are stored as integer paise with a `_paise` column suffix. No floating-point or number types are permitted in database schemas or repositories.
4. **Append-Only Audit Log:** All mutations to settings, business entities, and periods write immutable audit log rows in the same transaction, enforced by SQLite triggers.

---

## 2. Binding Column Conventions

| Concern           | SQLite Type     | Format / Rule                            | Description & Rationale                                                                              |
| ----------------- | --------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Primary Keys**  | `TEXT`          | UUID v4 (`crypto.randomUUID()`)          | Never autoincrementing integers. Enables multi-station merge without PK collisions.                  |
| **Dates**         | `TEXT`          | `YYYY-MM-DD` (ISO-8601)                  | Pure date strings without time component (e.g. `2026-07-01`).                                        |
| **Timestamps**    | `TEXT`          | `YYYY-MM-DDTHH:mm:ss.sssZ`               | ISO-8601 UTC timestamp ending in `Z`.                                                                |
| **Booleans**      | `INTEGER`       | `0` (false) or `1` (true)                | Explicit integer flags (`is_active`, `is_union_territory`).                                          |
| **Money Columns** | `INTEGER`       | Integer count of paise                   | Must always be named with `_paise` suffix (e.g. `taxable_amount_paise`, `total_amount_paise`).       |
| **Concurrency**   | `INTEGER`       | `row_version DEFAULT 1`                  | Optimistic locking counter incremented on each update.                                               |
| **Audit Columns** | `TEXT` / `TEXT` | `created_at`, `updated_at`, `deleted_at` | Every business table carries `created_at`, `updated_at`, and nullable `deleted_at` for soft deletes. |

---

## 3. Unique Partial Indexes with Soft Deletes

Whenever a table requires a unique constraint (e.g. unique bill number per party per financial year), it **must** be created as a partial index filtering out soft-deleted records:

```sql
CREATE UNIQUE INDEX idx_bills_unique_active
ON bills (party_id, normalized_bill_number, financial_year)
WHERE deleted_at IS NULL;
```

This prevents a cancelled/deleted bill from blocking re-entry of the same bill number.

---

## 4. Mandatory Connection Pragmas

Every SQLite connection must execute and immediately verify:

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = FULL;
```

---

## 5. Foundation Tables in Part 1C

1. `schema_migrations` — Tracks forward-only migration history and SHA-256 checksums.
2. `app_settings` — Key-value store for application configuration with audit logging.
3. `states` — Indian GST State Master list (`01`–`38`, `96`, `97`).
4. `tax_rate_profiles` — Configurable GST tax rate profiles (effective validity windows).
5. `audit_log` — Append-only audit record protected by `audit_log_no_update` and `audit_log_no_delete` triggers.
6. `backups` — Backup metadata history (populated in Part 1D).
