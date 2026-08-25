import crypto from 'node:crypto';
import type Database from 'better-sqlite3';

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'CANCEL'
  | 'RESTORE'
  | 'PERIOD_CLOSE'
  | 'PERIOD_REOPEN'
  | 'SETTING_CHANGE';

export interface AuditParams {
  entityTable: string;
  entityId: string;
  action: AuditAction;
  before?: unknown;
  after?: unknown;
  reason?: string;
  actor?: string;
}

/**
 * Executes a mutation function and inserts an immutable audit log entry in the same transaction.
 *
 * Guarantees atomicity: if either the business mutation or the audit log write fails,
 * both are completely rolled back.
 *
 * @param db better-sqlite3 Database instance
 * @param params Audit record details (entityTable, entityId, action, before, after, reason, actor)
 * @param fn Callback performing the business mutation
 * @returns Result of the callback fn
 */
export function withAudit<T>(db: Database.Database, params: AuditParams, fn: () => T): T {
  const auditId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const beforeJson = params.before !== undefined ? JSON.stringify(params.before) : null;
  const afterJson = params.after !== undefined ? JSON.stringify(params.after) : null;
  const reason = params.reason ?? null;
  const actor = params.actor ?? 'local';

  const transaction = db.transaction(() => {
    // 1. Perform business operation
    const result = fn();

    // 2. Write audit log entry
    db.prepare(
      `
      INSERT INTO audit_log (
        id, entity_table, entity_id, action, before_json, after_json, reason, actor, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      auditId,
      params.entityTable,
      params.entityId,
      params.action,
      beforeJson,
      afterJson,
      reason,
      actor,
      createdAt,
    );

    return result;
  });

  return transaction();
}
