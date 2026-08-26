import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { paise, type Paise, type Period, type PeriodOpeningCredit } from '@gst/core';
import { withAudit } from './audit.js';

interface PeriodRow {
  id: string;
  financial_year: string;
  year: number;
  month: number;
  label: string;
  status: 'OPEN' | 'CLOSED';
  opened_at: string;
  closed_at: string | null;
  closed_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  row_version: number;
}

interface OpeningCreditRow {
  id: string;
  period_id: string;
  amount_paise: number | bigint;
  source_note: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  row_version: number;
}

function mapPeriod(row: PeriodRow): Period {
  return {
    id: row.id,
    financialYear: row.financial_year,
    year: row.year,
    month: row.month,
    label: row.label,
    status: row.status,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    closedBy: row.closed_by,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    rowVersion: row.row_version,
  };
}

export class PeriodsRepository {
  constructor(private db: Database.Database) {}

  public list(): Period[] {
    const rows = this.db
      .prepare('SELECT * FROM periods WHERE deleted_at IS NULL ORDER BY year DESC, month DESC')
      .all() as PeriodRow[];
    return rows.map(mapPeriod);
  }

  public getById(id: string): Period | null {
    const row = this.db
      .prepare('SELECT * FROM periods WHERE id = ? AND deleted_at IS NULL')
      .get(id) as PeriodRow | undefined;
    return row ? mapPeriod(row) : null;
  }

  public getByYearMonth(year: number, month: number): Period | null {
    const row = this.db
      .prepare('SELECT * FROM periods WHERE year = ? AND month = ? AND deleted_at IS NULL')
      .get(year, month) as PeriodRow | undefined;
    return row ? mapPeriod(row) : null;
  }

  public create(
    input: Omit<Period, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'rowVersion'>,
    actor = 'local',
  ): Period {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const created: Period = {
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
        entityTable: 'periods',
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
            INSERT INTO periods (
              id, financial_year, year, month, label, status, opened_at,
              closed_at, closed_by, notes, created_at, updated_at, row_version
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
          `,
          )
          .run(
            id,
            input.financialYear,
            input.year,
            input.month,
            input.label,
            input.status,
            input.openedAt,
            input.closedAt ?? null,
            input.closedBy ?? null,
            input.notes ?? null,
            now,
            now,
          );

        return created;
      },
    );
  }

  public getOpeningCredit(periodId: string): PeriodOpeningCredit | null {
    const row = this.db
      .prepare('SELECT * FROM period_opening_credits WHERE period_id = ? AND deleted_at IS NULL')
      .get(periodId) as OpeningCreditRow | undefined;

    if (!row) return null;
    return {
      id: row.id,
      periodId: row.period_id,
      amountPaise: paise(BigInt(row.amount_paise)),
      sourceNote: row.source_note,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
      rowVersion: row.row_version,
    };
  }

  public setOpeningCredit(
    periodId: string,
    amountPaise: Paise,
    sourceNote?: string,
    actor = 'local',
  ): PeriodOpeningCredit {
    const existing = this.getOpeningCredit(periodId);
    const now = new Date().toISOString();
    const id = existing ? existing.id : crypto.randomUUID();

    const updated: PeriodOpeningCredit = {
      id,
      periodId,
      amountPaise,
      sourceNote: sourceNote ?? null,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
      deletedAt: null,
      rowVersion: existing ? existing.rowVersion + 1 : 1,
    };

    return withAudit(
      this.db,
      {
        entityTable: 'period_opening_credits',
        entityId: id,
        action: existing ? 'UPDATE' : 'CREATE',
        before: existing,
        after: updated,
        actor,
      },
      () => {
        this.db
          .prepare(
            `
            INSERT INTO period_opening_credits (
              id, period_id, amount_paise, source_note, created_at, updated_at, row_version
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(period_id) DO UPDATE SET
              amount_paise = excluded.amount_paise,
              source_note = excluded.source_note,
              updated_at = excluded.updated_at,
              row_version = period_opening_credits.row_version + 1
          `,
          )
          .run(
            id,
            periodId,
            Number(amountPaise),
            sourceNote ?? null,
            now,
            now,
            updated.rowVersion,
          );

        return updated;
      },
    );
  }
}
