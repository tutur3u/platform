import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceUserReport } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import {
  fetchManagersForGroups,
  getUserGroupMemberships,
} from '@tuturuuu/users-core/lib/user-groups/groups-utils';
import { sortWorkspaceUsersByArchive } from '@tuturuuu/users-core/reports/user-archive';
import { MAX_SHORT_TEXT_LENGTH } from '@tuturuuu/utils/constants';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPostgrestRateLimitMetadata } from '@/lib/postgrest-rate-limit';

const SearchParamsSchema = z.object({
  reportId: z.string().max(MAX_SHORT_TEXT_LENGTH).optional(),
  userId: z.string().max(MAX_SHORT_TEXT_LENGTH).optional(),
});

const ReportsDashboardErrorCode = {
  FETCH_FAILED: 'REPORTS_FETCH_FAILED',
  GROUP_FORBIDDEN: 'REPORTS_GROUP_FORBIDDEN',
  GROUP_NOT_FOUND: 'REPORTS_GROUP_NOT_FOUND',
  INTERNAL_ERROR: 'REPORTS_INTERNAL_ERROR',
  INVALID_QUERY: 'REPORTS_INVALID_QUERY',
  PERMISSION_DENIED: 'REPORTS_PERMISSION_DENIED',
  RATE_LIMITED: 'REPORTS_RATE_LIMITED',
  WORKSPACE_NOT_FOUND: 'REPORTS_WORKSPACE_NOT_FOUND',
} as const;

type ReportsDashboardErrorCodeValue =
  (typeof ReportsDashboardErrorCode)[keyof typeof ReportsDashboardErrorCode];

type ReportsDashboardContext = {
  groupId?: string;
  operation?: string;
  reportId?: string;
  userId?: string;
  wsId?: string;
};

function summarizeError(error: unknown) {
  if (!error || typeof error !== 'object') return error;

  const maybeError = error as {
    code?: unknown;
    message?: unknown;
    name?: unknown;
  };

  return {
    code: typeof maybeError.code === 'string' ? maybeError.code : undefined,
    message:
      typeof maybeError.message === 'string' ? maybeError.message : undefined,
    name: typeof maybeError.name === 'string' ? maybeError.name : undefined,
  };
}

function reportsDashboardErrorResponse({
  code,
  context,
  error,
  headers,
  message,
  status,
}: {
  code: ReportsDashboardErrorCodeValue;
  context: ReportsDashboardContext;
  error?: unknown;
  headers?: Record<string, string>;
  message: string;
  status: number;
}) {
  const metadata = {
    ...context,
    code,
    error: error ? summarizeError(error) : undefined,
    status,
  };

  if (status >= 500) {
    console.error('Reports dashboard API failed', metadata);
  } else {
    console.warn('Reports dashboard API rejected request', metadata);
  }

  return NextResponse.json({ code, message }, { status, headers });
}

function reportsDashboardRateLimitResponse(
  error: unknown,
  context: ReportsDashboardContext
) {
  const metadata =
    error && typeof error === 'object'
      ? getPostgrestRateLimitMetadata(
          error as {
            code?: string | null;
            details?: string | null;
            hint?: string | null;
            message?: string | null;
          }
        )
      : null;

  if (!metadata) return null;

  const headers: Record<string, string> = { ...metadata.headers };
  if (metadata.retryAfter !== null && metadata.retryAfter > 0) {
    headers['Retry-After'] = `${metadata.retryAfter}`;
  }

  return reportsDashboardErrorResponse({
    code: ReportsDashboardErrorCode.RATE_LIMITED,
    context: {
      ...context,
      operation: context.operation,
    },
    error,
    headers,
    message: 'Reports request was rate limited',
    status: 429,
  });
}

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
      return reportsDashboardErrorResponse({
        code: ReportsDashboardErrorCode.INVALID_QUERY,
        context: { groupId, wsId },
        error: parsedSearchParams.error,
        message: 'Invalid query parameters',
        status: 400,
      });
    }

    const { reportId, userId } = parsedSearchParams.data;

    const permissions = await getPermissions({ wsId, request });

    if (!permissions) {
      return reportsDashboardErrorResponse({
        code: ReportsDashboardErrorCode.WORKSPACE_NOT_FOUND,
        context: { groupId, reportId, userId, wsId },
        message: 'Workspace not found',
        status: 404,
      });
    }

    const { containsPermission } = permissions;
    if (!containsPermission('view_user_groups_reports')) {
      return reportsDashboardErrorResponse({
        code: ReportsDashboardErrorCode.PERMISSION_DENIED,
        context: { groupId, reportId, userId, wsId },
        message: 'Missing permission to view reports',
        status: 403,
      });
    }

    if (!containsPermission('manage_users')) {
      const accessibleGroupIds = await getUserGroupMemberships(wsId);
      if (!accessibleGroupIds.includes(groupId)) {
        return reportsDashboardErrorResponse({
          code: ReportsDashboardErrorCode.GROUP_FORBIDDEN,
          context: { groupId, reportId, userId, wsId },
          message: 'Missing access to this report group',
          status: 403,
        });
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

    for (const { operation, result } of [
      { operation: 'group', result: groupResult },
      { operation: 'users', result: usersResult },
      {
        operation: 'user-status-summary',
        result: userStatusSummaryResult,
      },
      { operation: 'reports', result: reportsResult },
      { operation: 'report-detail', result: reportDetailResult },
      {
        operation: 'user-group-metrics',
        result: userGroupMetricsResult,
      },
    ]) {
      if (!result.error) continue;

      const context = { groupId, operation, reportId, userId, wsId };
      const rateLimitResponse = reportsDashboardRateLimitResponse(
        result.error,
        context
      );
      if (rateLimitResponse) {
        return rateLimitResponse;
      }

      return reportsDashboardErrorResponse({
        code: ReportsDashboardErrorCode.FETCH_FAILED,
        context,
        error: result.error,
        message: 'Error fetching reports',
        status: 500,
      });
    }

    if (!groupResult.data) {
      return reportsDashboardErrorResponse({
        code: ReportsDashboardErrorCode.GROUP_NOT_FOUND,
        context: { groupId, reportId, userId, wsId },
        message: 'Group not found',
        status: 404,
      });
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
      console.warn('Reports dashboard selected report was not found', {
        availableReportIds: reports.map((report) => report.id),
        groupId,
        reportId,
        userId,
        wsId,
      });
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
    return reportsDashboardErrorResponse({
      code: ReportsDashboardErrorCode.INTERNAL_ERROR,
      context: {},
      error,
      message: 'Internal server error',
      status: 500,
    });
  }
}
