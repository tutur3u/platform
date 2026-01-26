import { createClient } from '@tuturuuu/supabase/next/server';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
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

const SearchParamsSchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const supabase = await createClient();
    const { wsId: id } = await params;

    const wsId = await normalizeWorkspaceId(id);

    // Check permissions
    const { containsPermission, withoutPermission } = await getPermissions({
      wsId,
    });

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

    if (!hasManageUsers) {
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
    if (error) throw error;

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
