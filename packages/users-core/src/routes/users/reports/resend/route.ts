import { reserveSecurityBudget } from '@tuturuuu/storage-core/security-budget';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { verifySecret } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { getUserGroupRoutePermissions } from '../../../../lib/user-groups/route-auth';
import {
  resolveRequestActorAuthUid,
  resolveUserGroupRouteWorkspaceId,
} from '../../../../lib/user-groups/route-helpers';
import {
  deliveryMigrationPendingResponse,
  isDeliveryMigrationPending,
} from '../delivery-readiness';
import { getReportReadGroupIds } from '../group-read-access';
import { heldAuditTable, isHeldAuditMigrationPending } from '../held-reports';
import { ReportListLimitError } from '../report-list-query';
import { resolveReportPeriodTimezone } from '../report-period-filter';
import {
  countByReason,
  loadResendCandidates,
  RESEND_ACTION_PERMISSIONS,
  RESEND_ACTION_WINDOW_MINUTES,
  RESEND_ACTIONS_PER_WINDOW,
  RESEND_MAX_REPORTS_PER_ACTION,
  RESEND_REPORTS_PER_HOUR,
  RESEND_SCAN_LIMIT,
  ResendActionSchema,
  ResendPreviewSchema,
  ResendRateLimitError,
  type ResendTarget,
  requestReportResend,
  reserveResendBudget,
  STUCK_QUEUED_AFTER_MINUTES,
} from '../resend-reports';

// Admin-only, audited, rate-limited resend of periodic reports that failed,
// are stuck in the queue, or were approved but never sent. Each report goes
// through private.request_periodic_report_resend, which re-checks the
// confirmed state under the report row lock before the existing
// request_periodic_report_delivery pipeline: never skipped, sent, in flight
// or with an unknown outcome.

interface Params {
  params: Promise<{ wsId: string }>;
}
type AdminClient = TypedSupabaseClient;
const noStore = { 'Cache-Control': 'private, no-store' };
const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  NextResponse.json(body, { status, headers: { ...noStore, ...headers } });

const limits = {
  maxReportsPerAction: RESEND_MAX_REPORTS_PER_ACTION,
  actionsPerWindow: RESEND_ACTIONS_PER_WINDOW,
  actionWindowMinutes: RESEND_ACTION_WINDOW_MINUTES,
  reportsPerHour: RESEND_REPORTS_PER_HOUR,
  stuckAfterMinutes: STUCK_QUEUED_AFTER_MINUTES,
};

async function authorize(request: Request, params: Params['params']) {
  const { wsId: rawWsId } = await params;
  const wsId = await resolveUserGroupRouteWorkspaceId(rawWsId, request);
  const permissions = await getUserGroupRoutePermissions(wsId, request);
  if (
    !permissions ||
    !RESEND_ACTION_PERMISSIONS.every((name) =>
      permissions.containsPermission(name)
    )
  )
    return null;
  const accessibleGroupIds = await getReportReadGroupIds({
    request,
    wsId,
    canManageUsers: permissions.containsPermission('manage_users'),
  });
  return { wsId, accessibleGroupIds };
}

const classOutOfReach = (
  target: ResendTarget,
  accessibleGroupIds: string[] | null
) =>
  Boolean(
    target.target === 'scope' &&
      target.groupId &&
      accessibleGroupIds &&
      !accessibleGroupIds.includes(target.groupId)
  );

async function periodTimezone(
  sbAdmin: AdminClient,
  wsId: string,
  target: ResendTarget
) {
  if (target.target !== 'scope' || (!target.periodStart && !target.periodEnd))
    return 'UTC';
  const workspace = await sbAdmin
    .from('workspaces')
    .select('timezone')
    .eq('id', wsId)
    .maybeSingle();
  if (workspace.error) throw workspace.error;
  return resolveReportPeriodTimezone(workspace.data?.timezone, target.timezone);
}

// Resends between audit progress writes, so a timed-out batch still records
// what it queued again.
const PROGRESS_EVERY = 10;
async function recordProgress(
  sbAdmin: AdminClient,
  auditId: string,
  wsId: string,
  affectedIds: string[]
) {
  const progress = await heldAuditTable(sbAdmin)
    .update({
      affected_count: affectedIds.length,
      report_ids: [...affectedIds],
    })
    .eq('id', auditId)
    .eq('ws_id', wsId);
  if (progress.error)
    console.error('Periodic report resend audit progress failed', {
      auditId,
      reportIds: affectedIds,
      error: progress.error,
    });
}

const unauthorized = () => json({ message: 'Unauthorized' }, 403);
const classNotFound = () => json({ message: 'Class not found' }, 404);
const scopeTooLarge = () =>
  json(
    {
      code: 'RESEND_SCOPE_TOO_LARGE',
      limit: RESEND_MAX_REPORTS_PER_ACTION,
      message:
        'Too many reports to resend at once. Choose one class or a shorter period.',
    },
    422
  );
const auditPending = () =>
  json(
    {
      code: 'RESEND_AUDIT_UPDATING',
      message: 'Resend is updating. Please try again shortly.',
    },
    503
  );
// The resend audit value needs migration 20261104121500; until then the
// action check (23514) or the cadence not-null (23502) rejects the row and
// nothing is sent.
const isResendAuditPending = (error: unknown) =>
  isHeldAuditMigrationPending(error) ||
  (Boolean(error) &&
    typeof error === 'object' &&
    ['23514', '23502'].includes(String((error as { code?: unknown }).code)));

export async function GET(request: Request, { params }: Params) {
  try {
    const url = new URL(request.url);
    const parsed = ResendPreviewSchema.safeParse(
      Object.fromEntries(url.searchParams)
    );
    if (!parsed.success)
      return json(
        { message: 'Invalid resend scope', issues: parsed.error.issues },
        400
      );
    const access = await authorize(request, params);
    if (!access) return unauthorized();
    if (classOutOfReach(parsed.data, access.accessibleGroupIds))
      return classNotFound();
    const sbAdmin = await createAdminClient();
    const candidates = await loadResendCandidates(
      sbAdmin,
      access.wsId,
      parsed.data,
      access.accessibleGroupIds,
      await periodTimezone(sbAdmin, access.wsId, parsed.data)
    );
    return json({
      count: candidates.length,
      reasons: countByReason(candidates),
      limits,
    });
  } catch (error) {
    if (error instanceof ReportListLimitError)
      return json(
        {
          code: 'RESEND_SCOPE_TOO_LARGE',
          limit: RESEND_SCAN_LIMIT,
          message:
            'Too many reports in this scope. Choose one class or a shorter period.',
        },
        422
      );
    console.error('Periodic report resend preview failed', { error });
    return json({ message: 'Unable to load reports to resend' }, 500);
  }
}

export async function POST(request: Request, { params }: Params) {
  let auditId: string | null = null;
  let auditWsId: string | null = null;
  // Attempted: handed to the database. Affected: actually queued again.
  const attemptedIds: string[] = [];
  const affectedIds: string[] = [];
  let sbAdmin: AdminClient | null = null;
  try {
    const parsed = ResendActionSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success)
      return json(
        { message: 'Invalid resend request', issues: parsed.error.issues },
        400
      );
    const access = await authorize(request, params);
    if (!access) return unauthorized();
    const actorUserId = await resolveRequestActorAuthUid(request);
    if (!actorUserId) return unauthorized();
    const { wsId, accessibleGroupIds } = access;
    const body = parsed.data;
    if (classOutOfReach(body, accessibleGroupIds)) return classNotFound();
    sbAdmin = await createAdminClient();

    // Idempotency: a confirmation key acts at most once per workspace, and a
    // replay never consumes the rate limit.
    const previous = await heldAuditTable(sbAdmin)
      .select('action, status, requested_count, affected_count')
      .eq('ws_id', wsId)
      .eq('idempotency_key', body.idempotencyKey)
      .maybeSingle();
    if (previous.error) {
      if (isHeldAuditMigrationPending(previous.error)) return auditPending();
      throw previous.error;
    }
    if (previous.data) {
      if (
        previous.data.action !== 'resend' ||
        previous.data.status !== 'completed'
      )
        return json(
          {
            code: 'RESEND_IN_PROGRESS',
            message: 'This confirmation was already used. Refresh and retry.',
          },
          409
        );
      return json({
        requested: previous.data.requested_count,
        affected: previous.data.affected_count,
        replayed: true,
      });
    }

    // Checked first: the delivery RPC would otherwise mark reports blocked.
    const [globalGate, periodicGate] = await Promise.all([
      verifySecret({
        forceAdmin: true,
        name: 'ENABLE_EMAIL_SENDING',
        value: 'true',
        wsId,
      }),
      verifySecret({
        forceAdmin: true,
        name: 'ENABLE_REPORT_EMAIL_SENDING',
        value: 'true',
        wsId,
      }),
    ]);
    if (!globalGate || !periodicGate)
      return json(
        {
          code: 'RESEND_DELIVERY_DISABLED',
          message:
            'Both workspace email gates must be enabled before periodic reports can send.',
        },
        409
      );

    const candidates = await loadResendCandidates(
      sbAdmin,
      wsId,
      body,
      accessibleGroupIds,
      await periodTimezone(sbAdmin, wsId, body)
    );
    if (candidates.length !== body.expectedCount)
      return json(
        {
          code: 'RESEND_SCOPE_CHANGED',
          count: candidates.length,
          message:
            'Reports to resend changed. Review the new count and confirm.',
        },
        409
      );
    if (candidates.length > RESEND_MAX_REPORTS_PER_ACTION)
      return scopeTooLarge();

    try {
      await reserveResendBudget(reserveSecurityBudget, wsId, candidates.length);
    } catch (error) {
      if (error instanceof ResendRateLimitError)
        return json(
          {
            code: 'RESEND_RATE_LIMITED',
            retryAfter: error.retryAfterSeconds,
            limits,
            message: 'Too many resends in this workspace. Try again later.',
          },
          429,
          { 'Retry-After': String(error.retryAfterSeconds) }
        );
      console.error('Periodic report resend rate limit unavailable', { error });
      return json(
        {
          code: 'RESEND_RATE_LIMIT_UNAVAILABLE',
          message: 'Resend is unavailable right now. Please try again shortly.',
        },
        503
      );
    }

    // No resend without an audit row: who, when, workspace, scope, count.
    const audit = await heldAuditTable(sbAdmin)
      .insert({
        ws_id: wsId,
        actor_user_id: actorUserId,
        action: 'resend',
        // A selection has no period, class or single cadence: all null.
        cadence: body.target === 'scope' ? body.cadence : null,
        period_start:
          body.target === 'scope' ? (body.periodStart ?? null) : null,
        period_end: body.target === 'scope' ? (body.periodEnd ?? null) : null,
        group_id: body.target === 'scope' ? (body.groupId ?? null) : null,
        idempotency_key: body.idempotencyKey,
        requested_count: candidates.length,
        status: 'started',
      })
      .select('id')
      .single();
    if (audit.error) {
      if (audit.error.code === '23505')
        return json(
          {
            code: 'RESEND_IN_PROGRESS',
            message: 'This confirmation is already being processed.',
          },
          409
        );
      if (isResendAuditPending(audit.error)) return auditPending();
      throw audit.error;
    }
    const startedAuditId: string = audit.data.id;
    auditId = startedAuditId;

    // One report at a time, each under its own row lock in the database.
    auditWsId = wsId;
    const admin = sbAdmin;
    for (const [index, candidate] of candidates.entries()) {
      attemptedIds.push(candidate.id);
      if (await requestReportResend(admin, wsId, candidate))
        affectedIds.push(candidate.id);
      if ((index + 1) % PROGRESS_EVERY === 0 && index < candidates.length - 1)
        await recordProgress(admin, startedAuditId, wsId, affectedIds);
    }

    const completed = await heldAuditTable(sbAdmin)
      .update({
        status: 'completed',
        affected_count: affectedIds.length,
        report_ids: affectedIds,
        completed_at: new Date().toISOString(),
      })
      .eq('id', auditId)
      .eq('ws_id', wsId);
    if (completed.error)
      console.error('Periodic report resend audit completion failed', {
        auditId,
        reportIds: affectedIds,
        error: completed.error,
      });
    return json({
      requested: candidates.length,
      affected: affectedIds.length,
      reasons: countByReason(candidates),
      replayed: false,
    });
  } catch (error) {
    if (auditId && auditWsId && sbAdmin) {
      const failedError = await heldAuditTable(sbAdmin)
        .update({
          status: 'failed',
          affected_count: affectedIds.length,
          report_ids: affectedIds,
          completed_at: new Date().toISOString(),
        })
        .eq('id', auditId)
        .eq('ws_id', auditWsId)
        .then(
          (result: { error: unknown }) => result.error,
          (failure: unknown) => failure ?? new Error('audit update failed')
        );
      // The row may stay 'started'; the log keeps what was attempted.
      if (failedError)
        console.error('Periodic report resend audit failure record failed', {
          auditId,
          attemptedReportIds: attemptedIds,
          affectedReportIds: affectedIds,
          error: failedError,
        });
    }
    if (error instanceof ReportListLimitError) return scopeTooLarge();
    if (isDeliveryMigrationPending(error))
      return deliveryMigrationPendingResponse();
    console.error('Periodic report resend failed', {
      auditId,
      attemptedReportIds: attemptedIds,
      affectedReportIds: affectedIds,
      error,
    });
    return json({ message: 'Internal server error' }, 500);
  }
}
