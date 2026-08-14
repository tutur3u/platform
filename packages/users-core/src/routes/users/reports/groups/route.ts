import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  escapeLikeWildcards,
  fetchManagersForGroups,
  getUserGroupMembershipsForActor,
} from '@tuturuuu/users-core/lib/user-groups/groups-utils';
import {
  MAX_SEARCH_LENGTH,
  MAX_SHORT_TEXT_LENGTH,
} from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildPostgrestRateLimitResponse } from '../../../../lib/postgrest-rate-limit';
import { getUserGroupRoutePermissions } from '../../../../lib/user-groups/route-auth';
import {
  resolveRequestActorAuthUid,
  resolveUserGroupRouteWorkspaceId,
} from '../../../../lib/user-groups/route-helpers';
import { isMissingReportSearchRpc } from '../report-search';

const SearchParamsSchema = z.object({
  q: z.string().max(MAX_SEARCH_LENGTH).optional(),
  selectedGroupId: z.string().max(MAX_SHORT_TEXT_LENGTH).optional(),
});

interface Params {
  params: Promise<{ wsId: string }>;
}

type ReportGroup = { id: string; name: string | null; ws_id?: string | null };
type ReportGroupSearchRow = ReportGroup & {
  approved_count: number;
  pending_count: number;
  rejected_count: number;
};

const GROUP_RESULT_LIMIT = 20;

export async function GET(request: Request, { params }: Params) {
  try {
    const { wsId: rawWsId } = await params;
    const wsId = await resolveUserGroupRouteWorkspaceId(rawWsId, request);
    const permissions = await getUserGroupRoutePermissions(wsId, request);
    if (!permissions) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (!permissions.containsPermission('view_user_groups_reports')) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    const parsed = SearchParamsSchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid query parameters', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const actorAuthUid = await resolveRequestActorAuthUid(request);
    const accessibleGroupIds = permissions.containsPermission('manage_users')
      ? null
      : actorAuthUid
        ? await getUserGroupMembershipsForActor(wsId, actorAuthUid)
        : [];
    if (accessibleGroupIds?.length === 0) {
      return NextResponse.json({
        groups: [],
        hasMore: false,
        selectedGroup: null,
        selectedGroupManagers: [],
        groupStatusSummary: [],
      });
    }

    const sbAdmin = await createAdminClient();
    const privateDb = sbAdmin.schema('private');
    const smartSearchResult = await (
      privateDb.rpc as unknown as (
        name: string,
        args: {
          p_accessible_group_ids: string[] | null;
          p_limit: number;
          p_search: string;
          p_ws_id: string;
        }
      ) => Promise<{ data: ReportGroupSearchRow[] | null; error: unknown }>
    )('search_report_groups_for_selector', {
      p_accessible_group_ids: accessibleGroupIds,
      p_limit: GROUP_RESULT_LIMIT + 1,
      p_search: parsed.data.q ?? '',
      p_ws_id: wsId,
    });

    let searchRows: ReportGroupSearchRow[];
    if (!smartSearchResult.error) {
      searchRows = smartSearchResult.data ?? [];
    } else if (isMissingReportSearchRpc(smartSearchResult.error)) {
      let groupsQuery = sbAdmin
        .from('workspace_user_groups_with_guest')
        .select('id, name, ws_id')
        .eq('ws_id', wsId)
        .order('name')
        .limit(GROUP_RESULT_LIMIT + 1);
      if (parsed.data.q) {
        groupsQuery = groupsQuery.ilike(
          'name',
          `%${escapeLikeWildcards(parsed.data.q)}%`
        );
      }
      if (accessibleGroupIds) {
        groupsQuery = groupsQuery.in('id', accessibleGroupIds);
      }
      const fallbackResult = await groupsQuery;
      if (fallbackResult.error) {
        return (
          buildPostgrestRateLimitResponse(fallbackResult.error) ??
          NextResponse.json(
            { message: 'Error fetching report groups' },
            { status: 500 }
          )
        );
      }
      const fallbackGroups = (fallbackResult.data ?? []) as ReportGroup[];
      const fallbackSummary = await sbAdmin.rpc(
        'get_group_report_status_summary',
        { _ws_id: wsId }
      );
      if (fallbackSummary.error) {
        return (
          buildPostgrestRateLimitResponse(fallbackSummary.error) ??
          NextResponse.json(
            { message: 'Error fetching report groups' },
            { status: 500 }
          )
        );
      }
      const summaryByGroup = new Map(
        (fallbackSummary.data ?? []).map((row) => [row.group_id, row])
      );
      searchRows = fallbackGroups.map((group) => ({
        ...group,
        approved_count: summaryByGroup.get(group.id)?.approved_count ?? 0,
        pending_count: summaryByGroup.get(group.id)?.pending_count ?? 0,
        rejected_count: summaryByGroup.get(group.id)?.rejected_count ?? 0,
      }));
    } else {
      return (
        buildPostgrestRateLimitResponse(smartSearchResult.error) ??
        NextResponse.json(
          { message: 'Error fetching report groups' },
          { status: 500 }
        )
      );
    }

    const hasMore = searchRows.length > GROUP_RESULT_LIMIT;
    const visibleRows = searchRows.slice(0, GROUP_RESULT_LIMIT);
    const groups = visibleRows.map(({ id, name }) => ({ id, name }));
    let selectedGroup =
      groups.find((group) => group.id === parsed.data.selectedGroupId) ?? null;
    if (parsed.data.selectedGroupId && !selectedGroup) {
      let query = sbAdmin
        .from('workspace_user_groups_with_guest')
        .select('id, name, ws_id')
        .eq('ws_id', wsId)
        .eq('id', parsed.data.selectedGroupId);
      if (accessibleGroupIds) query = query.in('id', accessibleGroupIds);
      const result = await query.maybeSingle();
      if (result.error) {
        return (
          buildPostgrestRateLimitResponse(result.error) ??
          NextResponse.json(
            { message: 'Error fetching report groups' },
            { status: 500 }
          )
        );
      }
      selectedGroup = (result.data as ReportGroup | null) ?? null;
    }

    const selectedGroupManagers = selectedGroup
      ? ((await fetchManagersForGroups(sbAdmin, [selectedGroup.id]))[
          selectedGroup.id
        ] ?? [])
      : [];
    const groupStatusSummary = visibleRows.map((row) => ({
      approved_count: Number(row.approved_count),
      group_id: row.id,
      pending_count: Number(row.pending_count),
      rejected_count: Number(row.rejected_count),
    }));

    return NextResponse.json({
      groups,
      hasMore,
      selectedGroup,
      selectedGroupManagers,
      groupStatusSummary,
    });
  } catch (error) {
    console.error('Error in report groups API:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
