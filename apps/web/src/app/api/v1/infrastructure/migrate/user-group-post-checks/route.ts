import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  batchFetchViaFk,
  batchUpsert,
  createFetchResponse,
  createMigrationResponse,
  requireDevMode,
} from '../batch-upsert';

export async function GET(req: Request) {
  const devModeError = requireDevMode();
  if (devModeError) return devModeError;

  const url = new URL(req.url);
  const wsId = url.searchParams.get('ws_id');
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const limit = parseInt(url.searchParams.get('limit') || '500', 10);

  if (!wsId) {
    return Response.json({ error: 'ws_id is required' }, { status: 400 });
  }

  const supabase = await createAdminClient({ noCookie: true });

  // user_group_post_checks has no ws_id, so scope by posts in workspace groups.
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

  const postIds: string[] = [];
  const BATCH_SIZE = 100;
  for (let i = 0; i < groupIds.length; i += BATCH_SIZE) {
    const batchGroupIds = groupIds.slice(i, i + BATCH_SIZE);
    const { data: posts, error: postsError } = await supabase
      .from('user_group_posts')
      .select('id')
      .in('group_id', batchGroupIds);

    if (postsError) {
      return Response.json(
        { error: 'Failed to fetch posts', details: postsError.message },
        { status: 500 }
      );
    }

    postIds.push(...(posts?.map((p) => p.id) ?? []));
  }

  if (postIds.length === 0) {
    return Response.json({ data: [], count: 0 });
  }

  const result = await batchFetchViaFk({
    table: 'user_group_post_checks',
    fkValues: postIds,
    fkColumn: 'post_id',
    offset,
    limit,
    inBatchSize: 100,
    supabase,
  });

  return createFetchResponse(result, 'user-group-post-checks');
}

export async function PUT(req: Request) {
  const devModeError = requireDevMode();
  if (devModeError) return devModeError;

  const json = await req.json();
  const result = await batchUpsert({
    table: 'user_group_post_checks',
    data: json?.data || [],
    onConflict: 'post_id,user_id',
  });
  return createMigrationResponse(result, 'user-group-post-checks');
}
