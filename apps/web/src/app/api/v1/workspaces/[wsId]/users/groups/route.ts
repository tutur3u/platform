import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { MAX_SEARCH_LENGTH } from '@tuturuuu/utils/constants';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  applyAttendanceMemberCounts,
  fetchManagersForGroups,
  getShouldCountManagersInAttendance,
  matchesUserGroupSearch,
} from '@/app/[locale]/(dashboard)/[wsId]/users/groups/utils';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { buildPostgrestRateLimitResponse } from '@/lib/postgrest-rate-limit';

function normalizeListParam(value: string | undefined) {
  if (!value) return [];

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const SearchParamsSchema = z.object({
  includeArchived: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  q: z.string().max(MAX_SEARCH_LENGTH).optional(),
  ids: z.string().optional(),
  status: z.enum(['all', 'active', 'archived']).optional(),
  userId: z.guid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(10),
});

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

async function getUserGroupMembershipsForUser({
  platformUserId,
  sbAdmin,
  wsId,
}: {
  platformUserId: string;
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}) {
  const { data: linkedUser, error: linkedUserError } = await sbAdmin
    .from('workspace_user_linked_users')
    .select('virtual_user_id')
    .eq('ws_id', wsId)
    .eq('platform_user_id', platformUserId)
    .maybeSingle();

  if (linkedUserError) throw linkedUserError;

  const candidateUserIds = [linkedUser?.virtual_user_id, platformUserId].filter(
    (userId): userId is string => Boolean(userId)
  );

  const { data: memberships, error } = await sbAdmin
    .from('workspace_user_groups_users')
    .select('group_id')
    .in('user_id', candidateUserIds);

  if (error) throw error;

  return Array.from(
    new Set((memberships ?? []).map((membership) => membership.group_id))
  ).filter((groupId): groupId is string => Boolean(groupId));
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { wsId: id } = await params;
    const auth = await resolveSessionAuthContext(request, {
      allowAppSessionAuth: true,
    });

    if (!auth.ok) return auth.response;

    const sbAdmin = (await createAdminClient()) as TypedSupabaseClient;

    const wsId = await normalizeWorkspaceId(id, auth.supabase);

    // Check permissions
    const permissions = await getPermissions({
      user: auth.user,
      wsId,
      request,
    });
    if (!permissions) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    const { containsPermission, withoutPermission } = permissions;

    if (withoutPermission('view_user_groups')) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const spResult = SearchParamsSchema.safeParse(
      Object.fromEntries(searchParams)
    );

    if (!spResult.success) {
      return NextResponse.json(
        { message: 'Invalid query parameters', issues: spResult.error.issues },
        { status: 400 }
      );
    }

    const sp = spResult.data;

    const hasManageUsers = containsPermission('manage_users');

    let data: UserGroup[] = [];
    let count = 0;

    const status = sp.status ?? (sp.includeArchived ? 'all' : 'active');

    const queryBuilder = sbAdmin
      .from('workspace_user_groups_with_guest')
      .select(
        'id, ws_id, name, starting_date, ending_date, archived, notes, is_guest, amount, created_at',
        {
          count: 'exact',
        }
      )
      .eq('ws_id', wsId)
      .order('name');

    if (status === 'active') {
      queryBuilder.eq('archived', false);
    } else if (status === 'archived') {
      queryBuilder.eq('archived', true);
    }

    const shouldUseAccentInsensitiveSearch = Boolean(sp.q?.trim());

    const requestedGroupIds = normalizeListParam(sp.ids);

    if (requestedGroupIds.length > 0) {
      queryBuilder.in('id', requestedGroupIds);
    } else if (sp.userId) {
      const { data: userGroups } = await sbAdmin
        .from('workspace_user_groups_users')
        .select('group_id')
        .eq('user_id', sp.userId);

      const groupIds = userGroups?.map((ug) => ug.group_id) || [];
      if (groupIds.length === 0) {
        return NextResponse.json({ data: [], count: 0 });
      }
      queryBuilder.in('id', groupIds);
    } else if (!hasManageUsers) {
      const groupIds = await getUserGroupMembershipsForUser({
        platformUserId: auth.user.id,
        sbAdmin,
        wsId,
      });
      if (groupIds.length === 0) {
        return NextResponse.json({ data: [], count: 0 });
      }
      queryBuilder.in('id', groupIds);
    }

    if (!shouldUseAccentInsensitiveSearch) {
      const start = (sp.page - 1) * sp.pageSize;
      const end = sp.page * sp.pageSize - 1;
      queryBuilder.range(start, end);
    }

    const {
      data: fetchedData,
      error,
      count: fetchedCount,
    } = await queryBuilder;

    if (error) {
      const rateLimitResponse = buildPostgrestRateLimitResponse(error);
      if (rateLimitResponse) {
        return rateLimitResponse;
      }

      throw error;
    }

    let filteredData = (fetchedData as UserGroup[]) ?? [];

    if (shouldUseAccentInsensitiveSearch) {
      filteredData = filteredData.filter((group) =>
        matchesUserGroupSearch(group.name, sp.q ?? '')
      );

      count = filteredData.length;

      const start = (sp.page - 1) * sp.pageSize;
      data = filteredData.slice(start, start + sp.pageSize);
    } else {
      data = filteredData;
      count = fetchedCount ?? 0;
    }

    // Fetch managers for the fetched groups
    if (data.length > 0) {
      const groupIds = data.map((g) => g.id);
      const [managersByGroup, countManagersInAttendance] = await Promise.all([
        fetchManagersForGroups(sbAdmin, groupIds),
        getShouldCountManagersInAttendance(wsId),
      ]);

      data = applyAttendanceMemberCounts(
        data,
        managersByGroup,
        countManagersInAttendance
      );
    }

    return NextResponse.json({
      data,
      count,
    });
  } catch (error) {
    serverLogger.error('Error in workspace user groups API', { error });
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
