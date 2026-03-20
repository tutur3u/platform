import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import {
  getPostEmailQueueRows,
  summarizePostEmailQueue,
} from '@/lib/post-email-queue';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId });
  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;

  const includedGroups = searchParams.getAll('includedGroups');
  const excludedGroups = searchParams.getAll('excludedGroups');
  const userId = searchParams.get('userId') || undefined;

  const sbAdmin = await createAdminClient();

  const queryBuilder = sbAdmin
    .from('user_group_post_checks')
    .select(
      'user_id, user_group_posts!inner(id, group_id), workspace_users!inner(ws_id)',
      { count: 'exact' }
    )
    .eq('workspace_users.ws_id', wsId)
    .not('workspace_users.email', 'ilike', '%@easy%');

  if (includedGroups.length > 0) {
    queryBuilder.in('user_group_posts.group_id', includedGroups);
  }
  if (excludedGroups.length > 0) {
    queryBuilder.not('user_group_posts.group_id', 'in', excludedGroups);
  }
  if (userId) {
    queryBuilder.eq('user_id', userId);
  }

  const { data, count, error } = await queryBuilder;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const postIds = [
    ...new Set(
      (data ?? [])
        .map((row: any) => row.user_group_posts?.id)
        .filter((value: unknown): value is string => typeof value === 'string')
    ),
  ];
  const queueRows = await getPostEmailQueueRows(sbAdmin, postIds);
  const queueSummary = summarizePostEmailQueue(queueRows);

  return NextResponse.json({
    count: count || 0,
    ...queueSummary,
  });
}
