import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getWorkspaceUserLinkForUser } from '@tuturuuu/utils/workspace-user-link';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  MAX_MONTHLY_REPORT_TEXT_LENGTH,
  MAX_MONTHLY_REPORT_TITLE_LENGTH,
} from '../../../features/reports/report-limits';
import { getUserGroupMembershipsForActor } from '../../../lib/user-groups/groups-utils';
import { getUserGroupRoutePermissions } from '../../../lib/user-groups/route-auth';
import {
  resolveRequestActorAuthUid,
  resolveUserGroupRouteWorkspaceId,
} from '../../../lib/user-groups/route-helpers';

const CreateReportSchema = z.object({
  user_id: z.guid(),
  group_id: z.guid(),
  title: z.string().min(1).max(MAX_MONTHLY_REPORT_TITLE_LENGTH),
  content: z.string().max(MAX_MONTHLY_REPORT_TEXT_LENGTH),
  feedback: z.string().max(MAX_MONTHLY_REPORT_TEXT_LENGTH),
  score: z.number().nullable().optional(),
  scores: z.array(z.number()).nullable().optional(),
  cadence: z
    .enum(['weekly', 'monthly', 'quarterly', 'yearly'])
    .default('monthly'),
  period_start: z.iso.date().nullable().optional(),
  period_end: z.iso.date().nullable().optional(),
  generation_mode: z.enum(['manual', 'ai']).default('manual'),
  manager_instruction: z
    .string()
    .max(MAX_MONTHLY_REPORT_TEXT_LENGTH)
    .nullable()
    .optional(),
});

const ListReportsSchema = z.object({
  approvalStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  cadence: z
    .enum(['weekly', 'monthly', 'quarterly', 'yearly'])
    .default('monthly'),
  deliveryStatus: z
    .enum([
      'draft',
      'queued',
      'processing',
      'sent',
      'failed',
      'blocked',
      'cancelled',
    ])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(),
});

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const parsed = ListReportsSchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid query parameters', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { wsId: rawWsId } = await params;
    const wsId = await resolveUserGroupRouteWorkspaceId(rawWsId, request);
    const permissions = await getUserGroupRoutePermissions(wsId, request);
    if (
      !permissions?.containsPermission('view_user_groups_reports') &&
      !permissions?.containsPermission('approve_reports')
    ) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    const actorAuthUid = await resolveRequestActorAuthUid(request);
    const accessibleGroupIds = permissions.containsPermission('manage_users')
      ? null
      : actorAuthUid
        ? await getUserGroupMembershipsForActor(wsId, actorAuthUid)
        : [];
    if (accessibleGroupIds?.length === 0) {
      return NextResponse.json({
        counts: {
          approved: 0,
          blocked: 0,
          delivered: 0,
          draft: 0,
          failed: 0,
          pendingReview: 0,
          total: 0,
        },
        data: [],
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
        total: 0,
        workspace: { id: wsId, timezone: null },
      });
    }

    const sbAdmin = await createAdminClient();
    const privateDb = sbAdmin.schema('private');
    const from = (parsed.data.page - 1) * parsed.data.pageSize;
    const to = from + parsed.data.pageSize - 1;
    let listQuery = privateDb
      .from('external_user_monthly_reports_workspace_view')
      .select('*', { count: 'exact' })
      .eq('user_ws_id', wsId)
      .eq('cadence', parsed.data.cadence)
      .order('period_start', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(from, to);
    if (accessibleGroupIds)
      listQuery = listQuery.in('group_id', accessibleGroupIds);
    if (parsed.data.approvalStatus) {
      listQuery = listQuery.eq(
        'report_approval_status',
        parsed.data.approvalStatus
      );
    }
    if (parsed.data.deliveryStatus) {
      listQuery = listQuery.eq('delivery_status', parsed.data.deliveryStatus);
    }
    if (parsed.data.q) {
      const escaped = parsed.data.q
        .replaceAll('%', '\\%')
        .replaceAll('_', '\\_');
      listQuery = listQuery.or(
        `title.ilike.%${escaped}%,user_full_name.ilike.%${escaped}%,user_display_name.ilike.%${escaped}%`
      );
    }

    let countsQuery = privateDb
      .from('external_user_monthly_reports_workspace_view')
      .select('report_approval_status, delivery_status, generation_status')
      .eq('user_ws_id', wsId)
      .eq('cadence', parsed.data.cadence);
    if (accessibleGroupIds) {
      countsQuery = countsQuery.in('group_id', accessibleGroupIds);
    }

    const [listResult, countsResult, workspaceResult] = await Promise.all([
      listQuery,
      countsQuery,
      sbAdmin.from('workspaces').select('id, timezone').eq('id', wsId).single(),
    ]);
    if (listResult.error) throw listResult.error;
    if (countsResult.error) throw countsResult.error;
    if (workspaceResult.error) throw workspaceResult.error;

    const rows = countsResult.data ?? [];
    const counts = {
      approved: rows.filter((row) => row.report_approval_status === 'APPROVED')
        .length,
      blocked: rows.filter((row) => row.delivery_status === 'blocked').length,
      delivered: rows.filter((row) => row.delivery_status === 'sent').length,
      draft: rows.filter((row) => row.generation_status === 'draft').length,
      failed: rows.filter((row) => row.delivery_status === 'failed').length,
      pendingReview: rows.filter(
        (row) => row.report_approval_status === 'PENDING'
      ).length,
      total: rows.length,
    };
    const data = (listResult.data ?? []).map((row) => ({
      ...row,
      user_name:
        row.user_display_name ?? row.user_full_name ?? row.user_email ?? null,
    }));

    return NextResponse.json({
      counts,
      data,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      total: listResult.count ?? 0,
      workspace: workspaceResult.data,
    });
  } catch (error) {
    console.error('Error in reports GET:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const parsed = CreateReportSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const { wsId: rawWsId } = await params;
    const wsId = await resolveUserGroupRouteWorkspaceId(rawWsId, request);
    const actorAuthUid = await resolveRequestActorAuthUid(request);
    if (!actorAuthUid) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const permissions = await getUserGroupRoutePermissions(wsId, request);
    if (!permissions) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (!permissions.containsPermission('create_user_groups_reports')) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    const sbAdmin = await createAdminClient();
    const actorLink = await getWorkspaceUserLinkForUser(wsId, actorAuthUid, {
      authorizationClient: sbAdmin,
    });
    if (!actorLink?.virtual_user_id) {
      return NextResponse.json(
        { message: 'User not found in workspace' },
        { status: 403 }
      );
    }

    const privateDb = sbAdmin.schema('private');
    const configResult = await sbAdmin
      .from('workspace_configs')
      .select('value')
      .eq('ws_id', wsId)
      .eq('id', 'ENABLE_REPORT_APPROVAL')
      .maybeSingle();
    if (configResult.error) {
      return NextResponse.json(
        { message: 'Error resolving report approval settings' },
        { status: 500 }
      );
    }

    let existingQuery = privateDb
      .from('external_user_monthly_reports')
      .select('id')
      .eq('user_id', parsed.data.user_id)
      .eq('group_id', parsed.data.group_id);
    existingQuery =
      parsed.data.period_start && parsed.data.period_end
        ? existingQuery
            .eq('cadence', parsed.data.cadence)
            .eq('period_start', parsed.data.period_start)
            .eq('period_end', parsed.data.period_end)
        : existingQuery.eq('title', parsed.data.title);
    const existing = await existingQuery.limit(1).maybeSingle();
    if (existing.data) {
      return NextResponse.json(
        { message: 'Duplicate report exists' },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const approvalEnabled = (configResult.data?.value ?? 'true') === 'true';
    const requiresApproval =
      approvalEnabled || parsed.data.generation_mode === 'ai';
    const result = await privateDb
      .from('external_user_monthly_reports')
      .insert({
        ...parsed.data,
        generation_status:
          parsed.data.generation_mode === 'ai' ? 'draft' : 'ready',
        creator_id: actorLink.virtual_user_id,
        updated_by: actorLink.virtual_user_id,
        created_at: now,
        updated_at: now,
        ...(requiresApproval
          ? {}
          : {
              report_approval_status: 'APPROVED' as const,
              approved_by: actorLink.virtual_user_id,
              approved_at: now,
            }),
      })
      .select('id')
      .single();
    if (result.error) throw result.error;
    return NextResponse.json(result.data);
  } catch (error) {
    console.error('Error in reports POST:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
