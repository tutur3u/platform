import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  MAX_SEARCH_LENGTH,
  MAX_SHORT_TEXT_LENGTH,
} from '@tuturuuu/utils/constants';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  escapeLikeWildcards,
  fetchManagersForGroups,
  getUserGroupMemberships,
} from '@/app/[locale]/(dashboard)/[wsId]/users/groups/utils';
import { buildPostgrestRateLimitResponse } from '@/lib/postgrest-rate-limit';

const SearchParamsSchema = z.object({
  q: z.string().max(MAX_SEARCH_LENGTH).optional(),
  selectedGroupId: z.string().max(MAX_SHORT_TEXT_LENGTH).optional(),
});

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

type ReportGroup = {
  id: string;
  name: string | null;
  ws_id?: string | null;
};

type ReportStatusSummaryRow = {
  approved_count: number;
  group_id: string;
  pending_count: number;
  rejected_count: number;
};

export async function GET(request: Request, { params }: Params) {
  try {
    const { wsId: rawWsId } = await params;
    const wsId = await normalizeWorkspaceId(rawWsId);

    const permissions = await getPermissions({ wsId, request });
    if (!permissions) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { containsPermission } = permissions;
    if (!containsPermission('view_user_groups_reports')) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

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

    const { q, selectedGroupId } = parsedSearchParams.data;
    const hasManageUsers = containsPermission('manage_users');
    const accessibleGroupIds = hasManageUsers
      ? null
      : await getUserGroupMemberships(wsId);

    if (accessibleGroupIds && accessibleGroupIds.length === 0) {
      return NextResponse.json({
        groups: [],
        selectedGroup: null,
        selectedGroupManagers: [],
        groupStatusSummary: [],
      });
    }

    const sbAdmin = await createAdminClient();

    let groupsQuery = sbAdmin
      .from('workspace_user_groups_with_guest')
      .select('id, name, ws_id')
      .eq('ws_id', wsId)
      .order('name')
      .limit(20);

    if (q) {
      groupsQuery = groupsQuery.ilike('name', `%${escapeLikeWildcards(q)}%`);
    }

    if (accessibleGroupIds) {
      groupsQuery = groupsQuery.in('id', accessibleGroupIds);
    }

    const { data: groupsData, error: groupsError } = await groupsQuery;

    if (groupsError) {
      const rateLimitResponse = buildPostgrestRateLimitResponse(groupsError);
      if (rateLimitResponse) {
        return rateLimitResponse;
      }

      console.error('Error fetching report groups:', groupsError);
      return NextResponse.json(
        { message: 'Error fetching report groups' },
        { status: 500 }
      );
    }

    const groups = (groupsData ?? []) as ReportGroup[];
    let selectedGroup =
      groups.find((group) => group.id === selectedGroupId) ?? null;

    if (selectedGroupId && !selectedGroup) {
      let selectedGroupQuery = sbAdmin
        .from('workspace_user_groups_with_guest')
        .select('id, name, ws_id')
        .eq('ws_id', wsId)
        .eq('id', selectedGroupId);

      if (accessibleGroupIds) {
        selectedGroupQuery = selectedGroupQuery.in('id', accessibleGroupIds);
      }

      const { data, error } = await selectedGroupQuery.maybeSingle();

      if (error) {
        const rateLimitResponse = buildPostgrestRateLimitResponse(error);
        if (rateLimitResponse) {
          return rateLimitResponse;
        }

        console.error('Error fetching selected report group:', error);
        return NextResponse.json(
          { message: 'Error fetching report groups' },
          { status: 500 }
        );
      }

      selectedGroup = (data as ReportGroup | null) ?? null;
    }

    const selectedGroupManagers =
      selectedGroupId && selectedGroup
        ? ((await fetchManagersForGroups(sbAdmin, [selectedGroupId]))[
            selectedGroupId
          ] ?? [])
        : [];

    const { data: groupStatusSummaryData, error: groupStatusSummaryError } =
      await sbAdmin.rpc('get_group_report_status_summary', { _ws_id: wsId });

    if (groupStatusSummaryError) {
      const rateLimitResponse = buildPostgrestRateLimitResponse(
        groupStatusSummaryError
      );
      if (rateLimitResponse) {
        return rateLimitResponse;
      }

      console.error(
        'Error fetching group report status summary:',
        groupStatusSummaryError
      );
      return NextResponse.json(
        { message: 'Error fetching report groups' },
        { status: 500 }
      );
    }

    const groupStatusSummary = (
      (groupStatusSummaryData ?? []) as ReportStatusSummaryRow[]
    ).filter(
      (row) => !accessibleGroupIds || accessibleGroupIds.includes(row.group_id)
    );

    return NextResponse.json({
      groups,
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
