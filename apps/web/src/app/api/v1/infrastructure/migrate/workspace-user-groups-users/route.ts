import { createClient } from '@tuturuuu/supabase/next/server';
import {
  batchUpsert,
  createMigrationResponse,
} from '../batch-upsert';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const wsId = url.searchParams.get('ws_id');
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const limit = parseInt(url.searchParams.get('limit') || '500', 10);

  if (!wsId) {
    return Response.json({ error: 'ws_id is required' }, { status: 400 });
  }

  const supabase = await createClient();

  // Junction table doesn't have ws_id - query via join with parent table
  // First get all group IDs for this workspace
  const { data: groups, error: groupsError } = await supabase
    .from('workspace_user_groups')
    .select('id')
    .eq('ws_id', wsId);

  if (groupsError) {
    return Response.json(
      { error: 'Failed to fetch groups', details: groupsError.message },
      { status: 500 }
    );
  }

  const groupIds = groups?.map((g) => g.id) ?? [];

  if (groupIds.length === 0) {
    return Response.json({ data: [], count: 0 });
  }

  // Count total records in junction table
  const { count: totalCount, error: countError } = await supabase
    .from('workspace_user_groups_users')
    .select('*', { count: 'exact', head: true })
    .in('group_id', groupIds);

  if (countError) {
    return Response.json(
      { error: 'Failed to count records', details: countError.message },
      { status: 500 }
    );
  }

  // Fetch paginated junction table data
  const { data, error } = await supabase
    .from('workspace_user_groups_users')
    .select('*')
    .in('group_id', groupIds)
    .range(offset, offset + limit - 1);

  if (error) {
    return Response.json(
      { error: 'Failed to fetch records', details: error.message },
      { status: 500 }
    );
  }

  return Response.json({
    data: data ?? [],
    count: totalCount ?? 0,
  });
}

export async function PUT(req: Request) {
  const json = await req.json();
  // Composite key: (group_id, user_id)
  const result = await batchUpsert({
    table: 'workspace_user_groups_users',
    data: json?.data || [],
    onConflict: 'group_id,user_id',
  });
  return createMigrationResponse(result, 'workspace-user-groups-users');
}
