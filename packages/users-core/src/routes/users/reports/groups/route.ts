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

const SearchParamsSchema = z.object({
  q: z.string().max(MAX_SEARCH_LENGTH).optional(),
  selectedGroupId: z.string().max(MAX_SHORT_TEXT_LENGTH).optional(),
});

interface Params {
  params: Promise<{ wsId: string }>;
}

type ReportGroup = { id: string; name: string | null; ws_id?: string | null };

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
    if (parsed.data.q) {
      groupsQuery = groupsQuery.ilike(
        'name',
        `%${escapeLikeWildcards(parsed.data.q)}%`
      );
    }
    if (accessibleGroupIds)
      groupsQuery = groupsQuery.in('id', accessibleGroupIds);

    const { data, error } = await groupsQuery;
    if (error) {
      return (
        buildPostgrestRateLimitResponse(error) ??
        NextResponse.json(
          { message: 'Error fetching report groups' },
          { status: 500 }
        )
      );
    }

    const groups = (data ?? []) as ReportGroup[];
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
    const summaryResult = await sbAdmin.rpc('get_group_report_status_summary', {
      _ws_id: wsId,
    });
    if (summaryResult.error) {
      return (
        buildPostgrestRateLimitResponse(summaryResult.error) ??
        NextResponse.json(
          { message: 'Error fetching report groups' },
          { status: 500 }
        )
      );
    }
    const groupStatusSummary = (summaryResult.data ?? []).filter(
      (row) =>
        !accessibleGroupIds ||
        accessibleGroupIds.includes((row as { group_id: string }).group_id)
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
