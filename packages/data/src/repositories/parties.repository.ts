import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Party } from '@gst/core';
import { withAudit } from './audit.js';

interface PartyRow {
  id: string;
  display_name: string;
  display_name_norm: string;
  legal_name: string | null;
  gstin: string | null;
  gstin_verified: number;
  state_code: string;
  address_line: string | null;
  city: string | null;
  pincode: string | null;
  phone: string | null;
  is_supplier: number;
  is_customer: number;
  is_active: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  row_version: number;
}

function mapParty(row: PartyRow): Party {
  return {
    id: row.id,
    displayName: row.display_name,
    displayNameNorm: row.display_name_norm,
    legalName: row.legal_name,
    gstin: row.gstin,
    gstinVerified: row.gstin_verified === 1,
    stateCode: row.state_code,
    addressLine: row.address_line,
    city: row.city,
    pincode: row.pincode,
    phone: row.phone,
    isSupplier: row.is_supplier === 1,
    isCustomer: row.is_customer === 1,
    isActive: row.is_active === 1,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    rowVersion: row.row_version,
  };
}

export function normalizePartyName(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export interface CreatePartyInput {
  displayName: string;
  legalName?: string | null;
  gstin?: string | null;
  gstinVerified?: boolean;
  stateCode: string;
  addressLine?: string | null;
  city?: string | null;
  pincode?: string | null;
  phone?: string | null;
  isSupplier?: boolean;
  isCustomer?: boolean;
  isActive?: boolean;
  notes?: string | null;
}

export class PartiesRepository {
  constructor(private db: Database.Database) {}

  public list(options?: { isSupplier?: boolean; isCustomer?: boolean; activeOnly?: boolean }): Party[] {
    let sql = 'SELECT * FROM parties WHERE deleted_at IS NULL';
    const params: unknown[] = [];

    if (options?.isSupplier) {
      sql += ' AND is_supplier = 1';
    }
    if (options?.isCustomer) {
      sql += ' AND is_customer = 1';
    }
    if (options?.activeOnly !== false) {
      sql += ' AND is_active = 1';
    }
    sql += ' ORDER BY display_name ASC';

    const rows = this.db.prepare(sql).all(...params) as PartyRow[];
    return rows.map(mapParty);
  }

  public getById(id: string): Party | null {
    const row = this.db
      .prepare('SELECT * FROM parties WHERE id = ? AND deleted_at IS NULL')
      .get(id) as PartyRow | undefined;
    return row ? mapParty(row) : null;
  }

  public getByGstin(gstin: string): Party | null {
    const row = this.db
      .prepare('SELECT * FROM parties WHERE gstin = ? AND deleted_at IS NULL')
      .get(gstin.trim()) as PartyRow | undefined;
    return row ? mapParty(row) : null;
  }

  public getByNormName(displayNameNorm: string): Party | null {
    const row = this.db
      .prepare('SELECT * FROM parties WHERE display_name_norm = ? AND deleted_at IS NULL')
      .get(displayNameNorm) as PartyRow | undefined;
    return row ? mapParty(row) : null;
  }

  public create(
    input: CreatePartyInput,
    actor = 'local',
  ): Party {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const displayNameNorm = normalizePartyName(input.displayName);

    const created: Party = {
      ...input,
      id,
      displayNameNorm,
      legalName: input.legalName ?? null,
      gstin: input.gstin ?? null,
      gstinVerified: input.gstinVerified === true,
      addressLine: input.addressLine ?? null,
      city: input.city ?? null,
      pincode: input.pincode ?? null,
      phone: input.phone ?? null,
      notes: input.notes ?? null,
      isActive: input.isActive !== false,
      isSupplier: input.isSupplier !== false,
      isCustomer: input.isCustomer === true,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      rowVersion: 1,
    };

    return withAudit(
      this.db,
      {
        entityTable: 'parties',
        entityId: id,
        action: 'CREATE',
        before: null,
        after: created,
        actor,
      },
      () => {
        this.db
          .prepare(
            `
            INSERT INTO parties (
              id, display_name, display_name_norm, legal_name, gstin, gstin_verified,
              state_code, address_line, city, pincode, phone, is_supplier, is_customer,
              is_active, notes, created_at, updated_at, row_version
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
          `,
          )
          .run(
            id,
            input.displayName,
            displayNameNorm,
            input.legalName ?? null,
            input.gstin ? input.gstin.trim() : null,
            input.gstinVerified ? 1 : 0,
            input.stateCode,
            input.addressLine ?? null,
            input.city ?? null,
            input.pincode ?? null,
            input.phone ?? null,
            input.isSupplier !== false ? 1 : 0,
            input.isCustomer === true ? 1 : 0,
            input.isActive !== false ? 1 : 0,
            input.notes ?? null,
            now,
            now,
          );

        return created;
      },
    );
  }
}
