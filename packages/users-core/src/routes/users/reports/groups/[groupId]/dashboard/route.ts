import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceUserReport } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import {
  fetchManagersForGroups,
  getUserGroupMembershipsForActor,
} from '@tuturuuu/users-core/lib/user-groups/groups-utils';
import { sortWorkspaceUsersByArchive } from '@tuturuuu/users-core/reports/user-archive';
import {
  MAX_SEARCH_LENGTH,
  MAX_SHORT_TEXT_LENGTH,
} from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserGroupRoutePermissions } from '../../../../../../lib/user-groups/route-auth';
import {
  resolveRequestActorAuthUid,
  resolveUserGroupRouteWorkspaceId,
} from '../../../../../../lib/user-groups/route-helpers';
import { isMissingReportSearchRpc } from '../../../report-search';

const SearchParamsSchema = z.object({
  reportId: z.string().max(MAX_SHORT_TEXT_LENGTH).optional(),
  userQuery: z.string().trim().max(MAX_SEARCH_LENGTH).optional(),
  userId: z.string().max(MAX_SHORT_TEXT_LENGTH).optional(),
});

const USER_SEARCH_LIMIT = 40;

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

    const { userId, reportId, userQuery } = parsed.data;
    const sbAdmin = await createAdminClient();
    const privateDb = sbAdmin.schema('private');
    const [
      groupResult,
      usersResult,
      selectedUserResult,
      managersByGroup,
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
          search_query: userQuery ?? '',
          include_archived: true,
        })
        .select('id, full_name, archived, archived_until, note')
        .order('full_name', { ascending: true, nullsFirst: false })
        .limit(USER_SEARCH_LIMIT + 1),
      userId
        ? sbAdmin
            .rpc('get_workspace_users', {
              _ws_id: wsId,
              included_groups: [groupId],
              excluded_groups: [],
              search_query: '',
              include_archived: true,
            })
            .select('id, full_name, archived, archived_until, note')
            .eq('id', userId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      fetchManagersForGroups(sbAdmin, [groupId]),
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
      selectedUserResult,
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

    const matchingUsers = (usersResult.data ?? []) as WorkspaceUser[];
    const userSearchHasMore = matchingUsers.length > USER_SEARCH_LIMIT;
    const visibleUsers = matchingUsers.slice(0, USER_SEARCH_LIMIT);
    const selectedUser = selectedUserResult.data as WorkspaceUser | null;
    const users = sortWorkspaceUsersByArchive(
      [
        ...visibleUsers,
        ...(selectedUser &&
        !visibleUsers.some((candidate) => candidate.id === selectedUser.id)
          ? [selectedUser]
          : []),
      ].map((user) => ({
        ...user,
        note: user.note ?? undefined,
      }))
    );
    const visibleUserIds = users.map((user) => user.id).filter(Boolean);
    const statusResult = await (
      privateDb.rpc as unknown as (
        name: string,
        args: {
          p_group_id: string;
          p_user_ids: string[];
          p_ws_id: string;
        }
      ) => Promise<{
        data: Array<{
          approved_count: number;
          pending_count: number;
          rejected_count: number;
          user_id: string;
        }> | null;
        error: unknown;
      }>
    )('get_report_user_status_summary', {
      p_group_id: groupId,
      p_user_ids: visibleUserIds,
      p_ws_id: wsId,
    });
    let userStatusSummary = statusResult.data ?? [];
    if (statusResult.error) {
      if (!isMissingReportSearchRpc(statusResult.error)) {
        console.error('Reports user status fetch failed:', statusResult.error);
        return NextResponse.json(
          { code: 'REPORTS_FETCH_FAILED', message: 'Error fetching reports' },
          { status: 500 }
        );
      }
      const fallbackStatusResult = await sbAdmin.rpc(
        'get_user_report_status_summary',
        {
          _group_id: groupId,
          _ws_id: wsId,
        }
      );
      if (fallbackStatusResult.error) {
        console.error(
          'Reports user status fallback failed:',
          fallbackStatusResult.error
        );
        return NextResponse.json(
          { code: 'REPORTS_FETCH_FAILED', message: 'Error fetching reports' },
          { status: 500 }
        );
      }
      const visibleUserIdSet = new Set(visibleUserIds);
      userStatusSummary = (fallbackStatusResult.data ?? []).filter((row) =>
        visibleUserIdSet.has(row.user_id)
      );
    }
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
      userSearchHasMore,
      userSearchTotal: visibleUsers.length,
      userStatusSummary,
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
