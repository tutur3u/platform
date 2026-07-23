import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { verifySecret } from '@tuturuuu/utils/workspace-helper';
import { getWorkspaceUserLinkForUser } from '@tuturuuu/utils/workspace-user-link';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertValidReportTimezone } from '../../../../lib/reports/periods';
import { getUserGroupRoutePermissions } from '../../../../lib/user-groups/route-auth';
import {
  resolveRequestActorAuthUid,
  resolveUserGroupRouteWorkspaceId,
} from '../../../../lib/user-groups/route-helpers';

const ScheduleSchema = z.object({
  cadence: z.enum(['weekly', 'monthly', 'quarterly', 'yearly']),
  delivery_time: z
    .string()
    .regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/)
    .default('09:00'),
  enabled: z.boolean(),
  generation_mode: z.enum(['manual', 'ai']),
  group_id: z.guid().nullable().optional(),
  manager_instruction: z.string().max(100000).nullable().optional(),
  timezone: z.string().trim().min(1).max(100),
});

interface Params {
  params: Promise<{ wsId: string }>;
}

async function getAccess(request: Request, params: Params['params']) {
  const { wsId: rawWsId } = await params;
  const wsId = await resolveUserGroupRouteWorkspaceId(rawWsId, request);
  const permissions = await getUserGroupRoutePermissions(wsId, request);
  return { permissions, wsId };
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { permissions, wsId } = await getAccess(request, params);
    if (
      !permissions?.containsPermission('view_user_groups_reports') &&
      !permissions?.containsPermission('manage_user_report_automation')
    ) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    const sbAdmin = await createAdminClient();
    const [
      schedulesResult,
      workspaceResult,
      senderResult,
      runsResult,
      deliveriesResult,
      globalGate,
      periodicGate,
    ] = await Promise.all([
      sbAdmin
        .schema('private')
        .from('user_report_schedules')
        .select('*')
        .eq('ws_id', wsId)
        .order('group_id', { ascending: true, nullsFirst: true })
        .order('cadence'),
      sbAdmin.from('workspaces').select('timezone').eq('id', wsId).single(),
      sbAdmin
        .from('workspace_email_credentials')
        .select('id')
        .eq('ws_id', wsId)
        .maybeSingle(),
      sbAdmin
        .schema('private')
        .from('user_report_automation_runs')
        .select(
          'id, cadence, period_start, period_end, status, completed_at, last_error'
        )
        .eq('ws_id', wsId)
        .order('created_at', { ascending: false })
        .limit(10),
      sbAdmin
        .schema('private')
        .from('user_report_email_attempts')
        .select(
          'id, status, attempted_at, error_message, user_report_email_queue!inner(ws_id)'
        )
        .eq('user_report_email_queue.ws_id', wsId)
        .order('attempted_at', { ascending: false })
        .limit(10),
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
    if (schedulesResult.error) throw schedulesResult.error;
    if (workspaceResult.error) throw workspaceResult.error;
    if (senderResult.error) throw senderResult.error;
    if (runsResult.error) throw runsResult.error;
    if (deliveriesResult.error) throw deliveriesResult.error;

    const senderConfigured = Boolean(senderResult.data);
    const schedules = schedulesResult.data ?? [];
    return NextResponse.json({
      canManage: permissions.containsPermission(
        'manage_user_report_automation'
      ),
      defaults: schedules.filter((schedule) => !schedule.group_id),
      emailDelivery: {
        globalGateEnabled: globalGate,
        periodicGateEnabled: periodicGate,
        ready: globalGate && periodicGate && senderConfigured,
        senderConfigured,
      },
      overrides: schedules.filter((schedule) => Boolean(schedule.group_id)),
      recentDeliveries: (deliveriesResult.data ?? []).map(
        ({ user_report_email_queue: _queue, ...attempt }) => attempt
      ),
      recentRuns: runsResult.data ?? [],
      workspaceTimezone: workspaceResult.data.timezone,
    });
  } catch (error) {
    console.error('Error in periodic report schedules GET:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const parsed = ScheduleSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { permissions, wsId } = await getAccess(request, params);
    if (!permissions?.containsPermission('manage_user_report_automation')) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }
    try {
      assertValidReportTimezone(parsed.data.timezone);
    } catch {
      return NextResponse.json(
        { message: 'A valid IANA workspace timezone is required' },
        { status: 400 }
      );
    }

    const actorAuthUid = await resolveRequestActorAuthUid(request);
    const sbAdmin = await createAdminClient();
    const actorLink = actorAuthUid
      ? await getWorkspaceUserLinkForUser(wsId, actorAuthUid, {
          authorizationClient: sbAdmin,
        })
      : null;
    if (!actorLink?.virtual_user_id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    if (parsed.data.group_id) {
      const group = await sbAdmin
        .from('workspace_user_groups')
        .select('id')
        .eq('id', parsed.data.group_id)
        .eq('ws_id', wsId)
        .maybeSingle();
      if (group.error || !group.data) {
        return NextResponse.json(
          { message: 'Group not found in this workspace' },
          { status: 404 }
        );
      }
    }

    const now = new Date().toISOString();
    const payload = {
      ...parsed.data,
      delivery_time:
        parsed.data.delivery_time.length === 5
          ? `${parsed.data.delivery_time}:00`
          : parsed.data.delivery_time,
      group_id: parsed.data.group_id ?? null,
      updated_at: now,
      updated_by: actorLink.virtual_user_id,
      ws_id: wsId,
    };
    const privateDb = sbAdmin.schema('private');
    let existingQuery = privateDb
      .from('user_report_schedules')
      .select('id')
      .eq('ws_id', wsId)
      .eq('cadence', parsed.data.cadence);
    existingQuery = parsed.data.group_id
      ? existingQuery.eq('group_id', parsed.data.group_id)
      : existingQuery.is('group_id', null);
    const existing = await existingQuery.maybeSingle();
    if (existing.error) throw existing.error;

    const result = existing.data
      ? await privateDb
          .from('user_report_schedules')
          .update(payload)
          .eq('id', existing.data.id)
          .select('id')
          .single()
      : await privateDb
          .from('user_report_schedules')
          .insert({
            ...payload,
            created_at: now,
            created_by: actorLink.virtual_user_id,
          })
          .select('id')
          .single();
    if (result.error) throw result.error;
    return NextResponse.json(result.data);
  } catch (error) {
    console.error('Error in periodic report schedules PUT:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
