import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceUserReport } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import {
  fetchManagersForGroups,
  getUserGroupMembershipsForActor,
} from '@tuturuuu/users-core/lib/user-groups/groups-utils';
import { sortWorkspaceUsersByArchive } from '@tuturuuu/users-core/reports/user-archive';
import { MAX_SHORT_TEXT_LENGTH } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserGroupRoutePermissions } from '../../../../../../lib/user-groups/route-auth';
import {
  resolveRequestActorAuthUid,
  resolveUserGroupRouteWorkspaceId,
} from '../../../../../../lib/user-groups/route-helpers';

const SearchParamsSchema = z.object({
  reportId: z.string().max(MAX_SHORT_TEXT_LENGTH).optional(),
  userId: z.string().max(MAX_SHORT_TEXT_LENGTH).optional(),
});

interface Params {
  params: Promise<{ groupId: string; wsId: string }>;
}

type ReportWithNames = WorkspaceUserReport & {
  creator_name?: string | null;
  group_name?: string | null;
  user_name?: string | null;
};

function mapReport(raw: Record<string, unknown>): ReportWithNames {
  return {
    ...raw,
    creator_name: raw.creator_full_name ?? null,
    group_name: raw.group_name ?? null,
    user_name: raw.user_full_name ?? null,
  } as ReportWithNames;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { groupId, wsId: rawWsId } = await params;
    const wsId = await resolveUserGroupRouteWorkspaceId(rawWsId, request);
    const parsed = SearchParamsSchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { code: 'REPORTS_INVALID_QUERY', message: 'Invalid query parameters' },
        { status: 400 }
      );
    }

    const permissions = await getUserGroupRoutePermissions(wsId, request);
    if (!permissions) {
      return NextResponse.json(
        { code: 'REPORTS_WORKSPACE_NOT_FOUND', message: 'Workspace not found' },
        { status: 404 }
      );
    }
    if (!permissions.containsPermission('view_user_groups_reports')) {
      return NextResponse.json(
        {
          code: 'REPORTS_PERMISSION_DENIED',
          message: 'Missing permission to view reports',
        },
        { status: 403 }
      );
    }

    const actorAuthUid = await resolveRequestActorAuthUid(request);
    if (!permissions.containsPermission('manage_users')) {
      const accessibleGroupIds = actorAuthUid
        ? await getUserGroupMembershipsForActor(wsId, actorAuthUid)
        : [];
      if (!accessibleGroupIds.includes(groupId)) {
        return NextResponse.json(
          {
            code: 'REPORTS_GROUP_FORBIDDEN',
            message: 'Missing access to this report group',
          },
          { status: 403 }
        );
      }
    }

    const { userId, reportId } = parsed.data;
    const sbAdmin = await createAdminClient();
    const privateDb = sbAdmin.schema('private');
    const [
      groupResult,
      usersResult,
      managersByGroup,
      statusResult,
      reportsResult,
      detailResult,
      metricsResult,
    ] = await Promise.all([
      sbAdmin
        .from('workspace_user_groups')
        .select('id, name')
        .eq('ws_id', wsId)
        .eq('id', groupId)
        .maybeSingle(),
      sbAdmin
        .rpc('get_workspace_users', {
          _ws_id: wsId,
          included_groups: [groupId],
          excluded_groups: [],
          search_query: '',
          include_archived: true,
        })
        .select('id, full_name, archived, archived_until, note')
        .order('full_name', { ascending: true, nullsFirst: false }),
      fetchManagersForGroups(sbAdmin, [groupId]),
      sbAdmin.rpc('get_user_report_status_summary', {
        _group_id: groupId,
        _ws_id: wsId,
      }),
      userId
        ? privateDb
            .from('external_user_monthly_reports_workspace_view')
            .select('*')
            .eq('user_id', userId)
            .eq('group_id', groupId)
            .eq('user_ws_id', wsId)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      userId && reportId && reportId !== 'new'
        ? privateDb
            .from('external_user_monthly_reports_workspace_view')
            .select('*')
            .eq('id', reportId)
            .eq('user_id', userId)
            .eq('group_id', groupId)
            .eq('user_ws_id', wsId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      userId
        ? sbAdmin
            .from('user_indicators')
            .select(
              'value, user_group_metrics!inner(id, name, unit, factor, is_weighted, group_id, created_at)'
            )
            .eq('user_id', userId)
            .eq('user_group_metrics.group_id', groupId)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const failed = [
      groupResult,
      usersResult,
      statusResult,
      reportsResult,
      detailResult,
      metricsResult,
    ].find((result) => result.error);
    if (failed?.error) {
      console.error('Reports dashboard fetch failed:', failed.error);
      return NextResponse.json(
        { code: 'REPORTS_FETCH_FAILED', message: 'Error fetching reports' },
        { status: 500 }
      );
    }
    if (!groupResult.data) {
      return NextResponse.json(
        { code: 'REPORTS_GROUP_NOT_FOUND', message: 'Group not found' },
        { status: 404 }
      );
    }

    const users = sortWorkspaceUsersByArchive(
      ((usersResult.data ?? []) as WorkspaceUser[]).map((user) => ({
        ...user,
        note: user.note ?? undefined,
      }))
    );
    const userGroupMetrics = (metricsResult.data ?? [])
      .sort((left: any, right: any) =>
        String(left.user_group_metrics.created_at).localeCompare(
          String(right.user_group_metrics.created_at)
        )
      )
      .map((item: any) => ({
        id: item.user_group_metrics.id,
        name: item.user_group_metrics.name,
        unit: item.user_group_metrics.unit,
        factor: item.user_group_metrics.factor,
        is_weighted: item.user_group_metrics.is_weighted,
        value: item.value,
      }));

    return NextResponse.json({
      group: groupResult.data,
      managers: managersByGroup[groupId] ?? [],
      users,
      userStatusSummary: statusResult.data ?? [],
      reports: (reportsResult.data ?? []).map((report) =>
        mapReport(report as Record<string, unknown>)
      ),
      reportDetail: detailResult.data
        ? mapReport(detailResult.data as Record<string, unknown>)
        : null,
      userGroupMetrics,
    });
  } catch (error) {
    console.error('Reports dashboard API failed:', error);
    return NextResponse.json(
      { code: 'REPORTS_INTERNAL_ERROR', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
