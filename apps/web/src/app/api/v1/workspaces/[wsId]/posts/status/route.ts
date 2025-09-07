import { createClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const searchParams = req.nextUrl.searchParams;

  const includedGroups = searchParams.getAll('includedGroups');
  const excludedGroups = searchParams.getAll('excludedGroups');
  const userId = searchParams.get('userId') || undefined;

  const supabase = await createClient();

  const queryBuilder = supabase
    .from('user_group_post_checks')
    .select(
      'workspace_users!inner(ws_id), sent_emails!inner(*), user_group_posts!inner(group_id)',
      {
        head: true,
        count: 'exact',
      }
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

  const { count, error } = await queryBuilder;

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }

  return Response.json({ count });
}
