import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { MAX_SEARCH_LENGTH } from '@tuturuuu/utils/constants';
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
  userId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(10),
});

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { wsId: id } = await params;
    const supabase = await createAdminClient();

    const wsId = await normalizeWorkspaceId(id);

    // Check permissions
    const permissions = await getPermissions({
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

    const queryBuilder = supabase
      .from('workspace_user_groups_with_guest')
      .select(
        'id, ws_id, name, starting_date, ending_date, archived, notes, is_guest, amount, created_at',
        {
          count: 'exact',
        }
      )
      .eq('ws_id', wsId)
      .order('name');

    if (sp.q) {
      const escapedSearch = escapeLikeWildcards(sp.q);
      queryBuilder.ilike('name', `%${escapedSearch}%`);
    }

    if (sp.userId) {
      const { data: userGroups } = await supabase
        .from('workspace_user_groups_users')
        .select('group_id')
        .eq('user_id', sp.userId);

      const groupIds = userGroups?.map((ug) => ug.group_id) || [];
      if (groupIds.length === 0) {
        return NextResponse.json({ data: [], count: 0 });
      }
      queryBuilder.in('id', groupIds);
    } else if (!hasManageUsers) {
      const groupIds = await getUserGroupMemberships(wsId);
      if (groupIds.length === 0) {
        return NextResponse.json({ data: [], count: 0 });
      }
      queryBuilder.in('id', groupIds);
    }

    const start = (sp.page - 1) * sp.pageSize;
    const end = sp.page * sp.pageSize - 1;
    queryBuilder.range(start, end);

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

    data = fetchedData as UserGroup[];
    count = fetchedCount ?? 0;

    // Fetch managers for the fetched groups
    if (data.length > 0) {
      const groupIds = data.map((g) => g.id);
      const managersByGroup = await fetchManagersForGroups(supabase, groupIds);
      data = data.map((g) => ({
        ...g,
        managers: managersByGroup[g.id] ?? [],
      }));
    }

    return NextResponse.json({
      data,
      count,
    });
  } catch (error) {
    console.error('Error in workspace user groups API:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
