import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { z } from 'zod';
import { periodicDeliveryCategory } from './report-delivery-category';
import { collectReportList } from './report-list-query';
import { buildReportPeriodFilter } from './report-period-filter';

// Same cap as the existing manual batch send (MAX_PERIODIC_DELIVERY_BATCH_SIZE).
export const HELD_SEND_LIMIT = 100;
export const HELD_SKIP_LIMIT = 1_000;
// Both permissions already gate the workspace-wide auto-send switch.
export const HELD_ACTION_PERMISSIONS = [
  'manage_user_report_automation',
  'send_user_group_report_emails',
] as const;

const HeldScopeFields = {
  cadence: z
    .enum(['weekly', 'monthly', 'quarterly', 'yearly'])
    .default('monthly'),
  periodStart: z.iso.date().optional(),
  periodEnd: z.iso.date().optional(),
  groupId: z.guid().optional(),
  // Viewer timezone, used for the period only when the workspace has none.
  timezone: z.string().trim().max(64).optional(),
};
type HeldScopeInput = {
  periodStart?: string;
  periodEnd?: string;
  groupId?: string;
};
const validScope = (scope: HeldScopeInput) =>
  Boolean(scope.periodStart) === Boolean(scope.periodEnd) &&
  Boolean(scope.periodStart || scope.groupId) &&
  (!scope.periodStart ||
    !scope.periodEnd ||
    scope.periodStart <= scope.periodEnd);
const scopeMessage = {
  message: 'Choose a period (start and end), a class, or both.',
};

export const HeldScopeSchema = z
  .object(HeldScopeFields)
  .refine(validScope, scopeMessage);
// Strict: the server derives the report set. Report ids are never accepted.
export const HeldActionSchema = z
  .object({
    ...HeldScopeFields,
    action: z.enum(['send', 'skip']),
    expectedCount: z.number().int().min(1).max(HELD_SKIP_LIMIT),
    idempotencyKey: z.guid(),
  })
  .strict()
  .refine(validScope, scopeMessage);
export type HeldScope = z.infer<typeof HeldScopeSchema>;

export function isHeldAuditMigrationPending(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  return ['42P01', 'PGRST205'].includes(String(error.code));
}

// The audit table and the held functions are newer than the generated client
// types (Rex regenerates them after applying the migration), so they are
// reached untyped, as in lib/post-check-audit.ts.
type UntypedPrivateSchema = {
  from: (table: string) => any;
  rpc: (
    name: string,
    args: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: { code?: string } | null }>;
};
const untypedPrivate = (sbAdmin: TypedSupabaseClient) =>
  (sbAdmin as any).schema('private') as UntypedPrivateSchema;
export function heldAuditTable(sbAdmin: TypedSupabaseClient) {
  return untypedPrivate(sbAdmin).from('periodic_report_held_actions');
}

/**
 * Send now for one report, only while it is still held. The held check and the
 * enqueue share one row lock in the database, so a Skip committed before or
 * during a Send now batch is never queued.
 */
export async function requestHeldReportDelivery(
  sbAdmin: TypedSupabaseClient,
  wsId: string,
  reportId: string
) {
  const { data, error } = await untypedPrivate(sbAdmin).rpc(
    'request_held_periodic_report_delivery',
    { p_report_id: reportId, p_ws_id: wsId, p_delivery_enabled: true }
  );
  if (error) throw error;
  return (data as { code?: number } | null)?.code === 200;
}

/** Skip, scoped to the workspace's subjects and classes; returns skipped ids. */
export async function skipHeldReports(
  sbAdmin: TypedSupabaseClient,
  wsId: string,
  reportIds: string[]
): Promise<string[]> {
  const { data, error } = await untypedPrivate(sbAdmin).rpc(
    'skip_held_periodic_reports',
    { p_ws_id: wsId, p_report_ids: reportIds }
  );
  if (error) throw error;
  return Array.isArray(data) ? data.map(String) : [];
}

const ID_CHUNK = 200;
export function chunks<T>(values: readonly T[], size = ID_CHUNK) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size)
    result.push(values.slice(index, index + size));
  return result;
}

/**
 * The held set, derived on the server only: this workspace, this scope, the
 * actor's readable classes, the shared held classification, and no send ever
 * requested. The period matches the worklist exactly: a saved period must
 * overlap it, and a report without one (every manually written report) matches
 * by its creation day in `timezone`. Throws ReportListLimitError above
 * HELD_SKIP_LIMIT candidates.
 */
export async function loadHeldReportIds(
  sbAdmin: TypedSupabaseClient,
  wsId: string,
  scope: HeldScope,
  accessibleGroupIds: string[] | null,
  timezone: string
): Promise<string[]> {
  if (accessibleGroupIds?.length === 0) return [];
  const privateDb = sbAdmin.schema('private');
  const periodFilter = buildReportPeriodFilter({
    periodStart: scope.periodStart,
    periodEnd: scope.periodEnd,
    timezone,
  });
  const rows = await collectReportList((offset, limit) => {
    let query = privateDb
      .from('external_user_monthly_reports_workspace_view')
      .select(
        'id, user_email, delivery_status, delivered_at, generation_status, last_delivery_error, report_approval_status, report_stage',
        { count: 'exact' }
      )
      .eq('user_ws_id', wsId)
      .eq('group_ws_id', wsId)
      .eq('cadence', scope.cadence)
      .eq('report_stage', 'approved')
      .eq('report_approval_status', 'APPROVED')
      .eq('delivery_status', 'draft')
      .is('delivered_at', null);
    if (periodFilter) query = query.or(periodFilter);
    if (scope.groupId) query = query.eq('group_id', scope.groupId);
    if (accessibleGroupIds) query = query.in('group_id', accessibleGroupIds);
    return query
      .order('period_start', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1);
  }, HELD_SKIP_LIMIT);
  const candidates = rows.flatMap((row) =>
    row.id && periodicDeliveryCategory(row) === 'held' ? [row.id] : []
  );

  // A report with any real send request (whatever its outcome) is not held.
  const requested = new Set<string>();
  for (const ids of chunks(candidates)) {
    const result = await privateDb
      .from('user_report_email_queue')
      .select('report_id')
      .eq('ws_id', wsId)
      .eq('delivery_kind', 'send')
      .in('report_id', ids);
    if (result.error) throw result.error;
    for (const row of result.data ?? []) requested.add(row.report_id);
  }
  return candidates.filter((id) => !requested.has(id));
}
