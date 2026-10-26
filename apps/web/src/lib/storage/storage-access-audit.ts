import {
  createStorageAccessAuditor,
  createStorageAccessAuditScope,
  type StorageAccessAuditEvent,
  type StorageAccessAuditor,
} from '@tuturuuu/storage-core/storage-access-audit';
import type { SupabaseClient } from '@tuturuuu/supabase';

/**
 * Web binding of the storage access audit. Off unless
 * STORAGE_ACCESS_AUDIT_ENABLED=true, so code can ship before the approved
 * `private.storage_access_events` migration is applied. Writes use the
 * service role and are never awaited by the request.
 */
let auditor: StorageAccessAuditor | null = null;

const disabledAuditor: StorageAccessAuditor = {
  record: () => undefined,
  settled: async () => undefined,
  stats: () => ({ dropped: 0, pending: 0, written: 0 }),
};

export function isStorageAccessAuditEnabled() {
  return process.env.STORAGE_ACCESS_AUDIT_ENABLED === 'true';
}

export function getStorageAccessAuditor(): StorageAccessAuditor {
  if (!isStorageAccessAuditEnabled()) return disabledAuditor;
  auditor ??= createStorageAccessAuditor({
    async insert(rows) {
      // The private schema is service-role only; generated types do not
      // include this append-only table, so use the untyped schema client.
      const { createAdminClient } = await import(
        '@tuturuuu/supabase/next/server'
      );
      const sbAdmin = (await createAdminClient()) as unknown as SupabaseClient;
      const { error } = await sbAdmin
        .schema('private')
        .from('storage_access_events')
        .insert(rows);
      if (error) throw error;
    },
    onError(error) {
      console.warn('Storage access audit write failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    },
  });
  return auditor;
}

export function auditStorageAccess(
  events: StorageAccessAuditEvent | StorageAccessAuditEvent[]
) {
  getStorageAccessAuditor().record(events);
}

export function storageAccessAuditScope(
  base: Parameters<typeof createStorageAccessAuditScope>[1]
) {
  return createStorageAccessAuditScope(getStorageAccessAuditor(), base);
}

export type StorageAccessAuditScope = ReturnType<
  typeof storageAccessAuditScope
>;

/**
 * Wraps a route handler so one audit row is recorded from its final status.
 * The handler fills in actor, workspace and path via `audit.set()`.
 */
export function withStorageAccessAudit<
  Args extends unknown[],
  R extends { status: number },
>(
  base: Parameters<typeof createStorageAccessAuditScope>[1],
  handler: (audit: StorageAccessAuditScope, ...args: Args) => Promise<R>
) {
  return async (...args: Args): Promise<R> => {
    const audit = storageAccessAuditScope(base);
    return audit.finish(await handler(audit, ...args));
  };
}

/** Test hook: drop the cached auditor. */
export function resetStorageAccessAuditorForTests() {
  auditor = null;
}
