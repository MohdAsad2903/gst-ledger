import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import type { OrgUnit } from '@gst/core';
import { withAudit } from './audit.js';

interface OrgUnitRow {
  id: string;
  name: string;
  short_name: string;
  gstin: string;
  state_code: string;
  address_line: string | null;
  city: string | null;
  pincode: string | null;
  invoice_series_label: string | null;
  is_default: number;
  is_active: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  row_version: number;
}

function mapOrgUnit(row: OrgUnitRow): OrgUnit {
  return {
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    gstin: row.gstin,
    stateCode: row.state_code,
    addressLine: row.address_line,
    city: row.city,
    pincode: row.pincode,
    invoiceSeriesLabel: row.invoice_series_label,
    isDefault: row.is_default === 1,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    rowVersion: row.row_version,
  };
}

export class OrgUnitsRepository {
  constructor(private db: Database.Database) {}

  public list(): OrgUnit[] {
    const rows = this.db
      .prepare('SELECT * FROM org_units WHERE deleted_at IS NULL ORDER BY is_default DESC, name ASC')
      .all() as OrgUnitRow[];
    return rows.map(mapOrgUnit);
  }

  public getById(id: string): OrgUnit | null {
    const row = this.db
      .prepare('SELECT * FROM org_units WHERE id = ? AND deleted_at IS NULL')
      .get(id) as OrgUnitRow | undefined;
    return row ? mapOrgUnit(row) : null;
  }

  public getDefault(): OrgUnit | null {
    const row = this.db
      .prepare('SELECT * FROM org_units WHERE is_default = 1 AND deleted_at IS NULL')
      .get() as OrgUnitRow | undefined;
    return row ? mapOrgUnit(row) : null;
  }

  public create(
    input: Omit<OrgUnit, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'rowVersion'>,
    actor = 'local',
  ): OrgUnit {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const created: OrgUnit = {
      ...input,
      id,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      rowVersion: 1,
    };

    return withAudit(
      this.db,
      {
        entityTable: 'org_units',
        entityId: id,
        action: 'CREATE',
        before: null,
        after: created,
        actor,
      },
      () => {
        if (input.isDefault) {
          this.db.prepare('UPDATE org_units SET is_default = 0 WHERE is_default = 1').run();
        }

        this.db
          .prepare(
            `
            INSERT INTO org_units (
              id, name, short_name, gstin, state_code, address_line, city, pincode,
              invoice_series_label, is_default, is_active, created_at, updated_at, row_version
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
          `,
          )
          .run(
            id,
            input.name,
            input.shortName,
            input.gstin,
            input.stateCode,
            input.addressLine ?? null,
            input.city ?? null,
            input.pincode ?? null,
            input.invoiceSeriesLabel ?? null,
            input.isDefault ? 1 : 0,
            input.isActive ? 1 : 0,
            now,
            now,
          );

        return created;
      },
    );
  }
}
