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
import {
  chunks,
  HELD_ACTION_PERMISSIONS,
  HELD_SEND_LIMIT,
  HELD_SKIP_LIMIT,
  HeldActionSchema,
  type HeldScope,
  HeldScopeSchema,
  heldAuditTable,
  isHeldAuditMigrationPending,
  loadHeldReportIds,
} from '../held-reports';
import { ReportListLimitError } from '../report-list-query';
import { resolveReportPeriodTimezone } from '../report-period-filter';

// Approved reports that were never requested for delivery stay held until an
// admin explicitly chooses Send now or Skip for a period and/or class. Nothing
// automatic (auto-send, deploys, migrations, cron) ever calls this route.

interface Params {
  params: Promise<{ wsId: string }>;
}
const noStore = { 'Cache-Control': 'private, no-store' };
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: noStore });

async function authorize(request: Request, params: Params['params']) {
  const { wsId: rawWsId } = await params;
  const wsId = await resolveUserGroupRouteWorkspaceId(rawWsId, request);
  const permissions = await getUserGroupRoutePermissions(wsId, request);
  if (
    !permissions ||
    !HELD_ACTION_PERMISSIONS.every((name) =>
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

function classOutOfReach(
  scope: HeldScope,
  accessibleGroupIds: string[] | null
) {
  return Boolean(
    scope.groupId &&
      accessibleGroupIds &&
      !accessibleGroupIds.includes(scope.groupId)
  );
}

type AdminClient = TypedSupabaseClient;
// The same timezone the worklist uses for reports without a saved period.
async function periodTimezone(
  sbAdmin: AdminClient,
  wsId: string,
  scope: HeldScope
) {
  if (!scope.periodStart && !scope.periodEnd) return 'UTC';
  const workspace = await sbAdmin
    .from('workspaces')
    .select('timezone')
    .eq('id', wsId)
    .maybeSingle();
  if (workspace.error) throw workspace.error;
  return resolveReportPeriodTimezone(workspace.data?.timezone, scope.timezone);
}

const unauthorized = () => json({ message: 'Unauthorized' }, 403);
const classNotFound = () => json({ message: 'Class not found' }, 404);
const scopeTooLarge = (limit: number) =>
  json(
    {
      code: 'HELD_SCOPE_TOO_LARGE',
      limit,
      message: 'Too many held reports. Choose one class or a shorter period.',
    },
    422
  );
const auditPending = () =>
  json(
    {
      code: 'HELD_AUDIT_UPDATING',
      message: 'Held report actions are updating. Please try again shortly.',
    },
    503
  );

export async function GET(request: Request, { params }: Params) {
  try {
    const url = new URL(request.url);
    const parsed = HeldScopeSchema.safeParse(
      Object.fromEntries(url.searchParams)
    );
    if (!parsed.success)
      return json(
        { message: 'Invalid scope', issues: parsed.error.issues },
        400
      );
    const access = await authorize(request, params);
    if (!access) return unauthorized();
    if (classOutOfReach(parsed.data, access.accessibleGroupIds))
      return classNotFound();
    const sbAdmin = await createAdminClient();
    const ids = await loadHeldReportIds(
      sbAdmin,
      access.wsId,
      parsed.data,
      access.accessibleGroupIds,
      await periodTimezone(sbAdmin, access.wsId, parsed.data)
    );
    return json({
      count: ids.length,
      sendLimit: HELD_SEND_LIMIT,
      skipLimit: HELD_SKIP_LIMIT,
    });
  } catch (error) {
    if (error instanceof ReportListLimitError)
      return scopeTooLarge(HELD_SKIP_LIMIT);
    console.error('Held periodic report preview failed', { error });
    return json({ message: 'Unable to load held reports' }, 500);
  }
}

export async function POST(request: Request, { params }: Params) {
  let auditId: string | null = null;
  const affectedIds: string[] = [];
  let sbAdmin: AdminClient | null = null;
  try {
    const parsed = HeldActionSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success)
      return json(
        { message: 'Invalid held report action', issues: parsed.error.issues },
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

    // Idempotency: a confirmation key acts at most once per workspace.
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
        previous.data.action !== body.action ||
        previous.data.status !== 'completed'
      )
        return json(
          {
            code: 'HELD_ACTION_IN_PROGRESS',
            message: 'This confirmation was already used. Refresh and retry.',
          },
          409
        );
      return json({
        action: body.action,
        requested: previous.data.requested_count,
        affected: previous.data.affected_count,
        replayed: true,
      });
    }

    if (body.action === 'send') {
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
            code: 'HELD_DELIVERY_DISABLED',
            message:
              'Both workspace email gates must be enabled before periodic reports can send.',
          },
          409
        );
    }

    const heldIds = await loadHeldReportIds(
      sbAdmin,
      wsId,
      body,
      accessibleGroupIds,
      await periodTimezone(sbAdmin, wsId, body)
    );
    if (heldIds.length !== body.expectedCount)
      return json(
        {
          code: 'HELD_SCOPE_CHANGED',
          count: heldIds.length,
          message: 'Held reports changed. Review the new count and confirm.',
        },
        409
      );
    if (body.action === 'send' && heldIds.length > HELD_SEND_LIMIT)
      return scopeTooLarge(HELD_SEND_LIMIT);

    // No action without an audit row: who, when, workspace, scope, action, count.
    const audit = await heldAuditTable(sbAdmin)
      .insert({
        ws_id: wsId,
        actor_user_id: actorUserId,
        action: body.action,
        cadence: body.cadence,
        period_start: body.periodStart ?? null,
        period_end: body.periodEnd ?? null,
        group_id: body.groupId ?? null,
        idempotency_key: body.idempotencyKey,
        requested_count: heldIds.length,
        status: 'started',
      })
      .select('id')
      .single();
    if (audit.error) {
      if (audit.error.code === '23505')
        return json(
          {
            code: 'HELD_ACTION_IN_PROGRESS',
            message: 'This confirmation is already being processed.',
          },
          409
        );
      if (isHeldAuditMigrationPending(audit.error)) return auditPending();
      throw audit.error;
    }
    auditId = audit.data.id;

    const privateDb = sbAdmin.schema('private');
    if (body.action === 'skip') {
      // Re-checked in the write itself, so a report that changed since the
      // count is left alone. No error text: a skip is not a delivery failure.
      for (const ids of chunks(heldIds)) {
        const result = await privateDb
          .from('external_user_monthly_reports')
          .update({ delivery_status: 'skipped' })
          .in('id', ids)
          .eq('delivery_status', 'draft')
          .eq('report_approval_status', 'APPROVED')
          .is('delivered_at', null)
          .select('id');
        if (result.error) throw result.error;
        affectedIds.push(...(result.data ?? []).map((row) => row.id));
      }
    } else {
      // The existing per-report pipeline: same locks, 409 guards, one queue
      // row per report, worker caps and workspace email limits.
      for (const reportId of heldIds) {
        const { data, error } = await privateDb.rpc(
          'request_periodic_report_delivery',
          {
            p_report_id: reportId,
            p_ws_id: wsId,
            p_action: 'send',
            p_delivery_enabled: true,
          }
        );
        if (error) throw error;
        if ((data as { code?: number } | null)?.code === 200)
          affectedIds.push(reportId);
      }
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
      console.error('Held periodic report audit completion failed', {
        auditId,
        error: completed.error,
      });
    return json({
      action: body.action,
      requested: heldIds.length,
      affected: affectedIds.length,
      replayed: false,
    });
  } catch (error) {
    if (auditId && sbAdmin) {
      await heldAuditTable(sbAdmin)
        .update({
          status: 'failed',
          affected_count: affectedIds.length,
          report_ids: affectedIds,
          completed_at: new Date().toISOString(),
        })
        .eq('id', auditId)
        .then(
          () => undefined,
          () => undefined
        );
    }
    if (error instanceof ReportListLimitError)
      return scopeTooLarge(HELD_SKIP_LIMIT);
    if (isDeliveryMigrationPending(error))
      return deliveryMigrationPendingResponse();
    console.error('Held periodic report action failed', { error });
    return json({ message: 'Internal server error' }, 500);
  }
}
