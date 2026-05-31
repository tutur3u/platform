import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceUserReport } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  fetchManagersForGroups,
  getUserGroupMemberships,
} from '@/app/[locale]/(dashboard)/[wsId]/users/groups/utils';
import { sortWorkspaceUsersByArchive } from '@/app/[locale]/(dashboard)/[wsId]/users/reports/user-archive';
import { buildPostgrestRateLimitResponse } from '@/lib/postgrest-rate-limit';

const SearchParamsSchema = z.object({
  reportId: z.string().optional(),
  userId: z.string().optional(),
});

type ReportStatusSummaryRow = {
  approved_count: number;
  pending_count: number;
  rejected_count: number;
  user_id: string;
};

type UserGroupMetricRow = {
  factor: number;
  id: string;
  is_weighted: boolean;
  name: string;
  unit: string;
  value: number | null;
};

type ReportWithNames = WorkspaceUserReport & {
  creator_name?: string | null;
  group_name?: string | null;
  creator_full_name?: string | null;
  user_full_name?: string | null;
  user_archived?: boolean;
  user_archived_until?: string | null;
  user_name?: string | null;
  user_note?: string | null;
};

function mapReportWithNames(raw: {
  user?: any;
  creator?: any;
  group_name?: string | null;
  name?: string | null;
  [key: string]: any;
}): ReportWithNames {
  const user = raw.user as unknown as
    | {
        full_name: string | null;
        archived: boolean;
        archived_until: string | null;
        note: string | null;
      }
    | {
        full_name: string | null;
        archived: boolean;
        archived_until: string | null;
        note: string | null;
      }[]
    | null;

  const creator = raw.creator as unknown as
    | { full_name: string | null }
    | { full_name: string | null }[]
    | null;

  const userName = Array.isArray(user) ? user?.[0]?.full_name : user?.full_name;
  const userArchived = Array.isArray(user)
    ? user?.[0]?.archived
    : user?.archived;
  const userArchivedUntil = Array.isArray(user)
    ? user?.[0]?.archived_until
    : user?.archived_until;
  const userNote = Array.isArray(user) ? user?.[0]?.note : user?.note;
  const creatorName = Array.isArray(creator)
    ? creator?.[0]?.full_name
    : creator?.full_name;

  const { user: _, creator: __, ...rest } = raw;

  return {
    ...rest,
    user_name: raw.user_full_name ?? userName,
    user_archived: raw.user_archived ?? userArchived,
    user_archived_until: raw.user_archived_until ?? userArchivedUntil,
    user_note: raw.user_note ?? userNote,
    creator_name: raw.creator_full_name ?? creatorName,
    group_name: raw.group_name ?? raw.name ?? null,
  } as ReportWithNames;
}

interface Params {
  params: Promise<{
    groupId: string;
    wsId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { groupId, wsId: rawWsId } = await params;
    const wsId = await normalizeWorkspaceId(rawWsId);
    const parsedSearchParams = SearchParamsSchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams)
    );

    if (!parsedSearchParams.success) {
      return NextResponse.json(
        {
          message: 'Invalid query parameters',
          issues: parsedSearchParams.error.issues,
        },
        { status: 400 }
      );
    }

    const { reportId, userId } = parsedSearchParams.data;

    console.log(
      `[Reports Dashboard] Request for group ${groupId}, user ${userId}, report ${reportId}`
    );

    const permissions = await getPermissions({ wsId, request });

    if (!permissions) {
      console.log(
        `[Reports Dashboard] No permissions found for workspace ${wsId}`
      );
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { containsPermission } = permissions;
    if (!containsPermission('view_user_groups_reports')) {
      console.log(
        `[Reports Dashboard] User lacks view_user_groups_reports permission`
      );
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    if (!containsPermission('manage_users')) {
      const accessibleGroupIds = await getUserGroupMemberships(wsId);
      console.log(
        `[Reports Dashboard] Non-manager user, accessible groups:`,
        accessibleGroupIds
      );
      if (!accessibleGroupIds.includes(groupId)) {
        console.log(
          `[Reports Dashboard] User doesn't have access to group ${groupId}`
        );
        return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
      }
    }

    const sbAdmin = await createAdminClient();
    const privateDb = sbAdmin.schema('private');

    const [
      groupResult,
      usersResult,
      managersByGroup,
      userStatusSummaryResult,
      reportsResult,
      reportDetailResult,
      userGroupMetricsResult,
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
              `
                value,
                user_group_metrics!inner(
                  id,
                  name,
                  unit,
                  factor,
                  is_weighted,
                  group_id,
                  created_at
                )
              `
            )
            .eq('user_id', userId)
            .eq('user_group_metrics.group_id', groupId)
        : Promise.resolve({ data: [], error: null }),
    ]);

    for (const result of [
      groupResult,
      usersResult,
      userStatusSummaryResult,
      reportsResult,
      reportDetailResult,
      userGroupMetricsResult,
    ]) {
      if (!result.error) continue;

      const rateLimitResponse = buildPostgrestRateLimitResponse(result.error);
      if (rateLimitResponse) {
        return rateLimitResponse;
      }

      console.error(
        'Error fetching group report dashboard data:',
        result.error
      );
      return NextResponse.json(
        { message: 'Error fetching reports' },
        { status: 500 }
      );
    }

    if (!groupResult.data) {
      return NextResponse.json({ message: 'Group not found' }, { status: 404 });
    }

    const users = sortWorkspaceUsersByArchive(
      ((usersResult.data ?? []) as WorkspaceUser[]).map((user) => ({
        ...user,
        note: user.note ?? undefined,
      }))
    );

    const userStatusSummary = (userStatusSummaryResult.data ??
      []) as ReportStatusSummaryRow[];
    const reports = (reportsResult.data || []).map((r) =>
      mapReportWithNames(r as any)
    );
    const reportDetail = reportDetailResult.data
      ? mapReportWithNames(reportDetailResult.data as any)
      : null;

    if (reportId && reportId !== 'new' && !reportDetail) {
      console.log(
        `[Reports Dashboard] Report detail not found for reportId=${reportId}, userId=${userId}, groupId=${groupId}`
      );
      console.log(
        `[Reports Dashboard] Available reports for user:`,
        reports.map((r) => ({ id: r.id, title: r.title, user_id: r.user_id }))
      );
    }
    const userGroupMetrics = (userGroupMetricsResult.data || [])
      .sort(
        (left: any, right: any) =>
          new Date(left.user_group_metrics.created_at ?? 0).getTime() -
          new Date(right.user_group_metrics.created_at ?? 0).getTime()
      )
      .map(
        (item: any): UserGroupMetricRow => ({
          id: item.user_group_metrics.id,
          name: item.user_group_metrics.name,
          unit: item.user_group_metrics.unit,
          factor: item.user_group_metrics.factor,
          is_weighted: item.user_group_metrics.is_weighted,
          value: item.value,
        })
      );

    return NextResponse.json({
      group: groupResult.data,
      userGroupMetrics,
      managers: managersByGroup[groupId] ?? [],
      reportDetail,
      reports,
      userStatusSummary,
      users,
    });
  } catch (error) {
    console.error('Error in group report dashboard API:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
