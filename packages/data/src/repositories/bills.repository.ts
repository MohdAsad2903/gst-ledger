import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  paise,
  type Paise,
  type Bill,
  type BillTaxLine,
  type CreateBillInput,
  type DuplicateBillError,
  type ProbableDuplicateMatch,
  type Result,
  type RoundingRule,
  type SupplyType,
  financialYearOf,
  normalizeBillNumber,
  splitTax,
  taxVariancePaise,
  roundToRupee,
  ok,
  err,
} from '@gst/core';
import { withAudit } from './audit.js';

interface BillRow {
  id: string;
  direction: 'PURCHASE' | 'SALE';
  period_id: string;
  org_unit_id: string | null;
  party_id: string | null;
  bill_number: string;
  bill_number_norm: string;
  bill_date: string;
  received_date: string | null;
  financial_year: string;
  place_of_supply_state_code: string;
  supply_type: 'INTRA' | 'INTER';
  supply_type_override_reason: string | null;
  total_amount_paise: number | bigint;
  tax_amount_paise: number | bigint;
  taxable_amount_paise: number | bigint;
  cgst_paise: number | bigint;
  sgst_paise: number | bigint;
  igst_paise: number | bigint;
  cess_paise: number | bigint;
  primary_rate_bps: number | null;
  is_multi_rate: number;
  tax_variance_paise: number | bigint;
  split_flags: string | null;
  variance_note: string | null;
  status: 'ACTIVE' | 'CANCELLED';
  cancellation_reason: string | null;
  payment_status: 'UNKNOWN' | 'UNPAID' | 'PARTIAL' | 'PAID';
  payment_note: string | null;
  itc_status: 'NOT_TRACKED' | 'ELIGIBLE' | 'INELIGIBLE';
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  row_version: number;
}

interface BillTaxLineRow {
  id: string;
  bill_id: string;
  line_no: number;
  rate_bps: number;
  taxable_paise: number | bigint;
  cgst_paise: number | bigint;
  sgst_paise: number | bigint;
  igst_paise: number | bigint;
  cess_paise: number | bigint;
  description: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  row_version: number;
}

function mapBill(row: BillRow): Bill {
  let splitFlags: Array<'SPLIT_ASYMMETRY' | 'SPLIT_FROM_ENTERED'> = [];
  if (row.split_flags) {
    try {
      splitFlags = JSON.parse(row.split_flags);
    } catch {
      splitFlags = [];
    }
  }

  return {
    id: row.id,
    direction: row.direction,
    periodId: row.period_id,
    orgUnitId: row.org_unit_id,
    partyId: row.party_id,
    billNumber: row.bill_number,
    billNumberNorm: row.bill_number_norm,
    billDate: row.bill_date,
    receivedDate: row.received_date,
    financialYear: row.financial_year,
    placeOfSupplyStateCode: row.place_of_supply_state_code,
    supplyType: row.supply_type,
    supplyTypeOverrideReason: row.supply_type_override_reason,
    totalAmountPaise: paise(BigInt(row.total_amount_paise)),
    taxAmountPaise: paise(BigInt(row.tax_amount_paise)),
    taxableAmountPaise: paise(BigInt(row.taxable_amount_paise)),
    cgstPaise: paise(BigInt(row.cgst_paise)),
    sgstPaise: paise(BigInt(row.sgst_paise)),
    igstPaise: paise(BigInt(row.igst_paise)),
    cessPaise: paise(BigInt(row.cess_paise)),
    primaryRateBps: row.primary_rate_bps !== null ? BigInt(row.primary_rate_bps) : null,
    isMultiRate: row.is_multi_rate === 1,
    taxVariancePaise: paise(BigInt(row.tax_variance_paise)),
    splitFlags,
    varianceNote: row.variance_note,
    status: row.status,
    cancellationReason: row.cancellation_reason,
    paymentStatus: row.payment_status,
    paymentNote: row.payment_note,
    itcStatus: row.itc_status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    rowVersion: row.row_version,
  };
}

function mapTaxLine(row: BillTaxLineRow): BillTaxLine {
  return {
    id: row.id,
    billId: row.bill_id,
    lineNo: row.line_no,
    rateBps: BigInt(row.rate_bps),
    taxablePaise: paise(BigInt(row.taxable_paise)),
    cgstPaise: paise(BigInt(row.cgst_paise)),
    sgstPaise: paise(BigInt(row.sgst_paise)),
    igstPaise: paise(BigInt(row.igst_paise)),
    cessPaise: paise(BigInt(row.cess_paise)),
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    rowVersion: row.row_version,
  };
}

export class BillsRepository {
  constructor(private db: Database.Database) {}

  public getById(id: string): { bill: Bill; taxLines: BillTaxLine[] } | null {
    const row = this.db
      .prepare('SELECT * FROM bills WHERE id = ? AND deleted_at IS NULL')
      .get(id) as BillRow | undefined;
    if (!row) return null;

    const lineRows = this.db
      .prepare('SELECT * FROM bill_tax_lines WHERE bill_id = ? AND deleted_at IS NULL ORDER BY line_no ASC')
      .all(id) as BillTaxLineRow[];

    return {
      bill: mapBill(row),
      taxLines: lineRows.map(mapTaxLine),
    };
  }

  public listByPeriod(periodId: string, direction?: 'PURCHASE' | 'SALE'): Bill[] {
    let sql = 'SELECT * FROM bills WHERE period_id = ? AND deleted_at IS NULL';
    const params: unknown[] = [periodId];
    if (direction) {
      sql += ' AND direction = ?';
      params.push(direction);
    }
    sql += ' ORDER BY bill_date ASC, bill_number ASC';

    const rows = this.db.prepare(sql).all(...params) as BillRow[];
    return rows.map(mapBill);
  }

  public findProbableDuplicates(candidate: {
    partyId?: string | null;
    totalAmountPaise: Paise;
    billDate: string;
    billNumber: string;
  }): ProbableDuplicateMatch[] {
    if (!candidate.partyId) return [];

    const norm = normalizeBillNumber(candidate.billNumber);
    const sql = `
      SELECT id, bill_number, bill_date, total_amount_paise, party_id, org_unit_id,
             CAST(round(abs(julianday(bill_date) - julianday(?))) AS INTEGER) as days_diff
      FROM bills
      WHERE party_id = ?
        AND total_amount_paise = ?
        AND status = 'ACTIVE'
        AND deleted_at IS NULL
        AND bill_number_norm <> ?
        AND abs(julianday(bill_date) - julianday(?)) <= 10
      ORDER BY days_diff ASC
    `;

    const rows = this.db
      .prepare(sql)
      .all(
        candidate.billDate,
        candidate.partyId,
        Number(candidate.totalAmountPaise),
        norm,
        candidate.billDate,
      ) as Array<{
      id: string;
      bill_number: string;
      bill_date: string;
      total_amount_paise: number | bigint;
      party_id: string | null;
      org_unit_id: string | null;
      days_diff: number;
    }>;

    return rows.map(r => ({
      id: r.id,
      billNumber: r.bill_number,
      billDate: r.bill_date,
      totalAmountPaise: paise(BigInt(r.total_amount_paise)),
      partyId: r.party_id,
      orgUnitId: r.org_unit_id,
      daysDifference: r.days_diff,
    }));
  }

  public create(
    input: CreateBillInput,
    options: { roundingRule: RoundingRule; ourStateCode?: string; actor?: string },
  ): Result<Bill, DuplicateBillError | string> {
    const actor = options.actor ?? 'local';
    const ourState = options.ourStateCode ?? '09';
    const billNumberNorm = normalizeBillNumber(input.billNumber);
    const financialYear = financialYearOf(input.billDate);

    // 1. Resolve State & Supply Type
    let placeOfSupplyStateCode = input.placeOfSupplyStateCode;
    let supplyType: SupplyType = input.supplyType ?? 'INTRA';

    if (input.direction === 'PURCHASE') {
      if (!input.partyId) {
        return err('PURCHASE bill requires a partyId');
      }
      const party = this.db
        .prepare('SELECT state_code FROM parties WHERE id = ? AND deleted_at IS NULL')
        .get(input.partyId) as { state_code: string } | undefined;

      if (!party) {
        return err(`Party not found: ${input.partyId}`);
      }

      if (!placeOfSupplyStateCode) {
        placeOfSupplyStateCode = party.state_code;
      }
      supplyType = placeOfSupplyStateCode === ourState ? 'INTRA' : 'INTER';
    } else {
      // SALE
      if (!input.orgUnitId) {
        return err('SALE bill requires an orgUnitId');
      }
      const orgUnit = this.db
        .prepare('SELECT state_code FROM org_units WHERE id = ? AND deleted_at IS NULL')
        .get(input.orgUnitId) as { state_code: string } | undefined;

      if (!orgUnit) {
        return err(`Org unit not found: ${input.orgUnitId}`);
      }

      if (!placeOfSupplyStateCode) {
        placeOfSupplyStateCode = orgUnit.state_code;
      }
      supplyType = placeOfSupplyStateCode === ourState ? 'INTRA' : 'INTER';
    }

    if (input.supplyType) {
      supplyType = input.supplyType;
    }

    // 2. Taxable amount & tax split
    const taxableAmountPaise = paise(input.totalAmountPaise - input.taxAmountPaise);

    let cgstPaise = 0n as Paise;
    let sgstPaise = 0n as Paise;
    let igstPaise = 0n as Paise;
    let taxVariance = 0n as Paise;
    let splitFlags: Array<'SPLIT_ASYMMETRY' | 'SPLIT_FROM_ENTERED'> = [];

    if (input.primaryRateBps !== undefined && input.primaryRateBps !== null) {
      taxVariance = taxVariancePaise(
        input.taxAmountPaise,
        taxableAmountPaise,
        input.primaryRateBps,
        options.roundingRule,
      );

      const split = splitTax({
        supplyType,
        taxable: taxableAmountPaise,
        totalTax: input.taxAmountPaise,
        rateBps: input.primaryRateBps,
        rule: options.roundingRule,
      });

      cgstPaise = split.cgst;
      sgstPaise = split.sgst;
      igstPaise = split.igst;
      splitFlags = split.flags;
    } else {
      // No primary rate specified
      if (supplyType === 'INTER') {
        igstPaise = input.taxAmountPaise;
      } else {
        cgstPaise = roundToRupee(paise(input.taxAmountPaise / 2n), options.roundingRule);
        sgstPaise = paise(input.taxAmountPaise - cgstPaise);
        if (cgstPaise !== sgstPaise) {
          splitFlags = ['SPLIT_FROM_ENTERED', 'SPLIT_ASYMMETRY'];
        } else {
          splitFlags = ['SPLIT_FROM_ENTERED'];
        }
      }
    }

    // 3. Check for Hard Duplicate Collision
    if (input.direction === 'PURCHASE') {
      const dupRow = this.db
        .prepare(
          `SELECT * FROM bills WHERE party_id = ? AND bill_number_norm = ? AND financial_year = ? AND deleted_at IS NULL AND direction = 'PURCHASE'`,
        )
        .get(input.partyId, billNumberNorm, financialYear) as BillRow | undefined;

      if (dupRow) {
        return err({
          code: 'DUPLICATE_BILL',
          message: `A purchase bill with number "${input.billNumber}" already exists for this supplier in FY ${financialYear}.`,
          existingBill: {
            id: dupRow.id,
            billNumber: dupRow.bill_number,
            billDate: dupRow.bill_date,
            totalAmountPaise: paise(BigInt(dupRow.total_amount_paise)),
            financialYear: dupRow.financial_year,
            direction: dupRow.direction,
            partyId: dupRow.party_id,
            orgUnitId: dupRow.org_unit_id,
          },
        });
      }
    } else {
      // SALE
      const dupRow = this.db
        .prepare(
          `SELECT * FROM bills WHERE org_unit_id = ? AND bill_number_norm = ? AND financial_year = ? AND deleted_at IS NULL AND direction = 'SALE'`,
        )
        .get(input.orgUnitId, billNumberNorm, financialYear) as BillRow | undefined;

      if (dupRow) {
        return err({
          code: 'DUPLICATE_BILL',
          message: `A sale bill with number "${input.billNumber}" already exists for this branch in FY ${financialYear}.`,
          existingBill: {
            id: dupRow.id,
            billNumber: dupRow.bill_number,
            billDate: dupRow.bill_date,
            totalAmountPaise: paise(BigInt(dupRow.total_amount_paise)),
            financialYear: dupRow.financial_year,
            direction: dupRow.direction,
            partyId: dupRow.party_id,
            orgUnitId: dupRow.org_unit_id,
          },
        });
      }
    }

    // 4. Validate Tax Lines if provided
    if (input.taxLines && input.taxLines.length > 0) {
      let sumTaxable = 0n;
      let sumTax = 0n;

      for (const line of input.taxLines) {
        sumTaxable += BigInt(line.taxablePaise);
        const lineCgst = line.cgstPaise ?? 0n;
        const lineSgst = line.sgstPaise ?? 0n;
        const lineIgst = line.igstPaise ?? 0n;
        const lineCess = line.cessPaise ?? 0n;
        sumTax += BigInt(lineCgst) + BigInt(lineSgst) + BigInt(lineIgst) + BigInt(lineCess);
      }

      if (sumTaxable !== BigInt(taxableAmountPaise) || sumTax !== BigInt(input.taxAmountPaise)) {
        return err('TAX_LINES_DO_NOT_SUM');
      }
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const createdBill: Bill = {
      id,
      direction: input.direction,
      periodId: input.periodId,
      orgUnitId: input.orgUnitId ?? null,
      partyId: input.partyId ?? null,
      billNumber: input.billNumber,
      billNumberNorm,
      billDate: input.billDate,
      receivedDate: input.receivedDate ?? null,
      financialYear,
      placeOfSupplyStateCode,
      supplyType,
      supplyTypeOverrideReason: input.supplyTypeOverrideReason ?? null,
      totalAmountPaise: input.totalAmountPaise,
      taxAmountPaise: input.taxAmountPaise,
      taxableAmountPaise,
      cgstPaise,
      sgstPaise,
      igstPaise,
      cessPaise: 0n as Paise,
      primaryRateBps: input.primaryRateBps ?? null,
      isMultiRate: input.isMultiRate ?? false,
      taxVariancePaise: taxVariance,
      splitFlags,
      varianceNote: input.varianceNote ?? null,
      status: input.status ?? 'ACTIVE',
      cancellationReason: input.cancellationReason ?? null,
      paymentStatus: input.paymentStatus ?? 'UNKNOWN',
      paymentNote: input.paymentNote ?? null,
      itcStatus: input.itcStatus ?? 'NOT_TRACKED',
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      rowVersion: 1,
    };

    return withAudit(
      this.db,
      {
        entityTable: 'bills',
        entityId: id,
        action: 'CREATE',
        before: null,
        after: createdBill,
        actor,
      },
      () => {
        this.db
          .prepare(
            `
            INSERT INTO bills (
              id, direction, period_id, org_unit_id, party_id, bill_number, bill_number_norm,
              bill_date, received_date, financial_year, place_of_supply_state_code, supply_type,
              supply_type_override_reason, total_amount_paise, tax_amount_paise, taxable_amount_paise,
              cgst_paise, sgst_paise, igst_paise, cess_paise, primary_rate_bps, is_multi_rate,
              tax_variance_paise, split_flags, variance_note, status, cancellation_reason,
              payment_status, payment_note, itc_status, notes, created_at, updated_at, row_version
            ) VALUES (
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1
            )
          `,
          )
          .run(
            id,
            createdBill.direction,
            createdBill.periodId,
            createdBill.orgUnitId,
            createdBill.partyId,
            createdBill.billNumber,
            billNumberNorm,
            createdBill.billDate,
            createdBill.receivedDate,
            financialYear,
            placeOfSupplyStateCode,
            supplyType,
            createdBill.supplyTypeOverrideReason,
            Number(createdBill.totalAmountPaise),
            Number(createdBill.taxAmountPaise),
            Number(createdBill.taxableAmountPaise),
            Number(cgstPaise),
            Number(sgstPaise),
            Number(igstPaise),
            Number(createdBill.cessPaise),
            createdBill.primaryRateBps !== null ? Number(createdBill.primaryRateBps) : null,
            createdBill.isMultiRate ? 1 : 0,
            Number(taxVariance),
            JSON.stringify(splitFlags),
            createdBill.varianceNote,
            createdBill.status,
            createdBill.cancellationReason,
            createdBill.paymentStatus,
            createdBill.paymentNote,
            createdBill.itcStatus,
            createdBill.notes,
            now,
            now,
          );

        // Insert Tax Lines if provided
        if (input.taxLines && input.taxLines.length > 0) {
          const insertLine = this.db.prepare(
            `
            INSERT INTO bill_tax_lines (
              id, bill_id, line_no, rate_bps, taxable_paise, cgst_paise, sgst_paise, igst_paise,
              cess_paise, description, created_at, updated_at, row_version
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
          `,
          );

          for (const line of input.taxLines) {
            const lineId = crypto.randomUUID();
            insertLine.run(
              lineId,
              id,
              line.lineNo,
              Number(line.rateBps),
              Number(line.taxablePaise),
              Number(line.cgstPaise ?? 0n),
              Number(line.sgstPaise ?? 0n),
              Number(line.igstPaise ?? 0n),
              Number(line.cessPaise ?? 0n),
              line.description ?? null,
              now,
              now,
            );
          }
        }

        return ok(createdBill);
      },
    );
  }
}
