import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  const supabase = await createClient(request);
  const { wsId } = await params;
  const url = new URL(request.url);
  const includedGroups = url.searchParams.getAll('includedGroups');

  const permissions = await getPermissions({ wsId, request });
  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const userGroupsPromise = supabase
    .from('workspace_user_groups_with_amount')
    .select('id, name, amount', { count: 'exact' })
    .eq('ws_id', wsId)
    .order('name');

  const excludedGroupsPromise = includedGroups.length
    ? supabase
        .rpc(
          'get_possible_excluded_groups',
          {
            _ws_id: wsId,
            included_groups: includedGroups,
          },
          { count: 'exact' }
        )
        .select('id, name, amount')
        .order('name')
    : userGroupsPromise;

  const usersPromise = supabase
    .from('workspace_users')
    .select('id, full_name')
    .eq('ws_id', wsId)
    .order('full_name', { ascending: true });

  const [userGroupsResult, excludedGroupsResult, usersResult] =
    await Promise.all([userGroupsPromise, excludedGroupsPromise, usersPromise]);

  if (
    userGroupsResult.error ||
    excludedGroupsResult.error ||
    usersResult.error
  ) {
    console.error('Error loading post filter options:', {
      userGroups: userGroupsResult.error,
      excludedGroups: excludedGroupsResult.error,
      users: usersResult.error,
    });
    return NextResponse.json(
      { message: 'Failed to load filter options' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    userGroups: userGroupsResult.data ?? [],
    excludedUserGroups: excludedGroupsResult.data ?? [],
    users: usersResult.data ?? [],
  });
}
