import { PERIODIC_RESEND_STUCK_AFTER_MINUTES } from '@tuturuuu/internal-api/reports';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { z } from 'zod';
import { chunks, HELD_ACTION_PERMISSIONS } from './held-reports';
import {
  isHeldPeriodicReport,
  periodicDeliveryCategory,
} from './report-delivery-category';
import { collectReportList } from './report-list-query';
import { buildReportPeriodFilter } from './report-period-filter';

// The same admin pair as the held Send now / Skip action.
export const RESEND_ACTION_PERMISSIONS = HELD_ACTION_PERMISSIONS;

/** K: reports per resend action. Same cap as the manual batch send. */
export const RESEND_MAX_REPORTS_PER_ACTION = 100;
/** N per M: resend actions per workspace in one fixed 10-minute window. */
export const RESEND_ACTIONS_PER_WINDOW = 10;
export const RESEND_ACTION_WINDOW_MINUTES = 10;
/** Reports resent per workspace in one fixed clock hour, across all actions. */
export const RESEND_REPORTS_PER_HOUR = 300;
/**
 * A queued report counts as stuck once it has waited this long without a
 * worker claim. It matches the existing "waiting more than 1 hour" queue
 * warning, and is well past the 15-minute worker lease, so a row a worker may
 * still claim is never touched.
 */
export const STUCK_QUEUED_AFTER_MINUTES = PERIODIC_RESEND_STUCK_AFTER_MINUTES;
/** The worker lease in claim_periodic_report_emails. */
export const WORKER_LEASE_MINUTES = 15;
/** Candidate rows read per scope before asking for a narrower scope. */
export const RESEND_SCAN_LIMIT = 1_000;

export const RESEND_REASONS = ['failed', 'stuck', 'held'] as const;
export type ResendReason = (typeof RESEND_REASONS)[number];

const CADENCE = z
  .enum(['weekly', 'monthly', 'quarterly', 'yearly'])
  .default('monthly');
const ScopeFields = {
  cadence: CADENCE,
  periodStart: z.iso.date().optional(),
  periodEnd: z.iso.date().optional(),
  groupId: z.guid().optional(),
  timezone: z.string().trim().max(64).optional(),
};
type ScopeInput = {
  periodStart?: string;
  periodEnd?: string;
  groupId?: string;
};
const validScope = (scope: ScopeInput) =>
  Boolean(scope.periodStart) === Boolean(scope.periodEnd) &&
  Boolean(scope.periodStart || scope.groupId) &&
  (!scope.periodStart ||
    !scope.periodEnd ||
    scope.periodStart <= scope.periodEnd);
const scopeMessage = {
  message: 'Choose a period (start and end), a class, or both.',
};
const ReportIds = z
  .array(z.guid())
  .min(1)
  .max(RESEND_MAX_REPORTS_PER_ACTION)
  .refine((ids) => new Set(ids).size === ids.length, {
    message: 'Report ids must be unique.',
  });

const ScopeTarget = z
  .object({ target: z.literal('scope'), ...ScopeFields })
  .strict()
  .refine(validScope, scopeMessage);
const SelectionTarget = z
  .object({ target: z.literal('selection'), reportIds: ReportIds })
  .strict();

/** GET: `target=scope` with a period and/or class, or `target=selection`. */
export const ResendPreviewSchema = z.preprocess(
  (value) => {
    if (!value || typeof value !== 'object') return value;
    const input = value as Record<string, unknown>;
    return typeof input.reportIds === 'string'
      ? { ...input, reportIds: input.reportIds.split(',').filter(Boolean) }
      : input;
  },
  z.union([ScopeTarget, SelectionTarget])
);
const ActionFields = {
  expectedCount: z.number().int().min(1).max(RESEND_MAX_REPORTS_PER_ACTION),
  idempotencyKey: z.guid(),
};
export const ResendActionSchema = z.union([
  z
    .object({ target: z.literal('scope'), ...ScopeFields, ...ActionFields })
    .strict()
    .refine(validScope, scopeMessage),
  z
    .object({
      target: z.literal('selection'),
      reportIds: ReportIds,
      ...ActionFields,
    })
    .strict(),
]);
export type ResendTarget = z.infer<typeof ResendPreviewSchema>;

export const UNKNOWN_OUTCOME_ERRORS = [
  'Delivery worker timed out. Delivery outcome is unknown; check provider logs before retrying.',
  'Email delivery outcome is unknown. Check provider logs before retrying.',
] as const;
const unknownOutcome = (error: string | null | undefined) => {
  const text = error?.toLowerCase() ?? '';
  return (
    UNKNOWN_OUTCOME_ERRORS.some((known) => error === known) ||
    text.includes('outcome is unknown') ||
    text.includes('provider accepted')
  );
};

export interface ResendReport {
  id: string;
  user_email: string | null;
  delivery_status: string | null;
  delivered_at: string | null;
  delivery_requested_at: string | null;
  generation_status: string | null;
  last_delivery_error: string | null;
  report_approval_status: string | null;
  report_stage: string | null;
}
export interface ResendQueue {
  report_id: string;
  status: string;
  delivery_kind: string;
  sent_at: string | null;
  last_error: string | null;
  next_attempt_at: string | null;
  locked_at: string | null;
  provider_message_id: string | null;
}

const minutesAgo = (now: number, at: string | null | undefined) => {
  const time = at ? Date.parse(at) : Number.NaN;
  return Number.isFinite(time) ? (now - time) / 60_000 : null;
};

/**
 * Why a report may be resent, or null when it must not be. Never: a report
 * that was sent or may have been sent (unknown outcome, provider accepted),
 * is in flight (processing, or queued for less than the stuck threshold),
 * was skipped or cancelled by a person, is not approved, has no recipient, or
 * failed for a reason that needs a fix first (suppression, missing email,
 * infrastructure, approval change).
 */
export function resendReason(
  report: ResendReport,
  queue: ResendQueue | null,
  now: number
): ResendReason | null {
  if (report.delivered_at || report.delivery_status === 'sent') return null;
  if (report.report_approval_status !== 'APPROVED') return null;
  if (!report.user_email?.trim()) return null;
  if (queue) {
    if (queue.sent_at || queue.provider_message_id) return null;
    if (queue.status === 'sent' && queue.delivery_kind === 'send') return null;
    if (queue.status === 'processing') return null;
    if (unknownOutcome(queue.last_error)) return null;
  }
  if (report.delivery_status === 'processing') return null;
  if (unknownOutcome(report.last_delivery_error)) return null;

  if (queue?.status === 'queued' || report.delivery_status === 'queued') {
    if (report.delivery_status !== 'queued') return null;
    // Waiting since the later of the request and the next allowed attempt.
    const requested = minutesAgo(now, report.delivery_requested_at);
    const attempt = minutesAgo(now, queue?.next_attempt_at);
    const waited =
      requested === null
        ? attempt
        : attempt === null
          ? requested
          : Math.min(requested, attempt);
    if (waited === null || waited < STUCK_QUEUED_AFTER_MINUTES) return null;
    const lockedFor = minutesAgo(now, queue?.locked_at);
    if (lockedFor !== null && lockedFor < WORKER_LEASE_MINUTES) return null;
    return 'stuck';
  }
  if (
    report.delivery_status === 'failed' ||
    report.delivery_status === 'blocked'
  )
    return periodicDeliveryCategory(report) === 'failure' ? 'failed' : null;
  if (report.delivery_status === 'draft')
    return isHeldPeriodicReport(report) ? 'held' : null;
  // skipped, cancelled: a person chose not to send.
  return null;
}

export interface ResendCandidate {
  id: string;
  reason: ResendReason;
  /** The delivery state confirmed now; the database resends only from it. */
  status: 'draft' | 'queued' | 'failed' | 'blocked';
}

const REPORT_COLUMNS =
  'id, user_email, delivery_status, delivered_at, delivery_requested_at, generation_status, last_delivery_error, report_approval_status, report_stage';
const QUEUE_COLUMNS =
  'report_id, status, delivery_kind, sent_at, last_error, next_attempt_at, locked_at, provider_message_id';

/**
 * The resend set, derived on the server only: this workspace on both the
 * subject and the class, the actor's readable classes, and `resendReason`.
 * A selection is re-checked report by report; ids from another workspace or
 * class simply do not match. Throws ReportListLimitError above
 * RESEND_SCAN_LIMIT candidates.
 */
export async function loadResendCandidates(
  sbAdmin: TypedSupabaseClient,
  wsId: string,
  target: ResendTarget,
  accessibleGroupIds: string[] | null,
  timezone: string,
  now = Date.now()
): Promise<ResendCandidate[]> {
  if (accessibleGroupIds?.length === 0) return [];
  const privateDb = sbAdmin.schema('private');
  const periodFilter =
    target.target === 'scope'
      ? buildReportPeriodFilter({
          periodStart: target.periodStart,
          periodEnd: target.periodEnd,
          timezone,
        })
      : null;
  const rows = await collectReportList((offset, limit) => {
    let query = privateDb
      .from('external_user_monthly_reports_workspace_view')
      .select(REPORT_COLUMNS, { count: 'exact' })
      .eq('user_ws_id', wsId)
      .eq('group_ws_id', wsId)
      .eq('report_approval_status', 'APPROVED')
      .is('delivered_at', null)
      .in('delivery_status', ['draft', 'queued', 'failed', 'blocked']);
    if (target.target === 'selection') query = query.in('id', target.reportIds);
    else {
      query = query.eq('cadence', target.cadence);
      if (periodFilter) query = query.or(periodFilter);
      if (target.groupId) query = query.eq('group_id', target.groupId);
    }
    if (accessibleGroupIds) query = query.in('group_id', accessibleGroupIds);
    return query
      .order('period_start', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1);
  }, RESEND_SCAN_LIMIT);

  const reports = rows as unknown as ResendReport[];
  const queues = new Map<string, ResendQueue>();
  for (const ids of chunks(reports.map((row) => row.id))) {
    const result = await privateDb
      .from('user_report_email_queue')
      .select(QUEUE_COLUMNS)
      .eq('ws_id', wsId)
      .in('report_id', ids);
    if (result.error) throw result.error;
    for (const row of (result.data ?? []) as unknown as ResendQueue[])
      queues.set(row.report_id, row);
  }
  return reports.flatMap((report) => {
    const queue = queues.get(report.id) ?? null;
    const reason = resendReason(report, queue, now);
    return reason
      ? [
          {
            id: report.id,
            reason,
            status: report.delivery_status as ResendCandidate['status'],
          },
        ]
      : [];
  });
}

export function countByReason(candidates: readonly ResendCandidate[]) {
  const counts: Record<ResendReason, number> = { failed: 0, stuck: 0, held: 0 };
  for (const candidate of candidates) counts[candidate.reason] += 1;
  return counts;
}

export type BudgetReserve = (
  dimensions: readonly (readonly [string, number, number, number])[]
) => Promise<[number, number]>;

export class ResendRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super('Resend rate limit reached');
  }
}

/**
 * Charges one action and `count` reports against the workspace's fixed
 * windows, atomically, in the shared Postgres security budget. A denial
 * throws ResendRateLimitError; an unavailable budget throws, so the caller
 * fails closed.
 */
export async function reserveResendBudget(
  reserve: BudgetReserve,
  wsId: string,
  count: number,
  now = Date.now()
) {
  const actionWindowMs = RESEND_ACTION_WINDOW_MINUTES * 60_000;
  const actionWindow = Math.floor(now / actionWindowMs);
  const hour = Math.floor(now / 3_600_000);
  const specs = [
    [
      `api-cost:v1:report-resend:actions:${wsId}:${actionWindow}`,
      1,
      RESEND_ACTIONS_PER_WINDOW,
      (actionWindowMs * 2) / 1000,
      (actionWindow + 1) * actionWindowMs,
    ],
    [
      `api-cost:v1:report-resend:reports:${wsId}:${hour}`,
      count,
      RESEND_REPORTS_PER_HOUR,
      7_200,
      (hour + 1) * 3_600_000,
    ],
  ] as const;
  const [allowed, position] = await reserve(
    specs.map(([key, amount, maximum, ttl]) => [key, amount, maximum, ttl])
  );
  if (allowed === 1) return;
  const resetAt = specs[position - 1]?.[4] ?? now + actionWindowMs;
  throw new ResendRateLimitError(
    Math.max(1, Math.ceil((resetAt - now) / 1000))
  );
}

// The resend function is newer than the generated client types, so it is
// reached untyped, as the held functions are.
type UntypedRpc = {
  rpc: (
    name: string,
    args: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: { code?: string } | null }>;
};

/**
 * Resend one report through private.request_periodic_report_resend: under the
 * report row lock it re-checks the confirmed state (never skipped, cancelled,
 * sent, processing or possibly sent), cancels a stuck queue row, and requests
 * delivery through request_periodic_report_delivery. A refusal changes
 * nothing. True only when the report was queued again.
 */
export async function requestReportResend(
  sbAdmin: TypedSupabaseClient,
  wsId: string,
  candidate: ResendCandidate
) {
  const { data, error } = await (
    (sbAdmin as any).schema('private') as UntypedRpc
  ).rpc('request_periodic_report_resend', {
    p_report_id: candidate.id,
    p_ws_id: wsId,
    p_expected_status: candidate.status,
    p_delivery_enabled: true,
  });
  if (error) throw error;
  return (data as { code?: number } | null)?.code === 200;
}
