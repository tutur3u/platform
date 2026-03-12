import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    groupId: string;
    wsId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { groupId, wsId } = await params;
  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get('cursor');
  const limit = Number.parseInt(searchParams.get('limit') ?? '10', 10);

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  const { withoutPermission } = permissions;
  if (withoutPermission('view_user_groups_posts')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to view user group posts' },
      { status: 403 }
    );
  }

  const supabase = await createAdminClient();
  let query = supabase
    .from('user_group_posts')
    .select('*', { count: 'exact' })
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  const { data, error, count } = await query;

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching user group posts' },
      { status: 500 }
    );
  }

  const posts = data ?? [];
  return NextResponse.json({
    data: posts,
    count: count ?? 0,
    nextCursor:
      posts.length === limit
        ? (posts[posts.length - 1]?.created_at ?? null)
        : null,
  });
}

export async function POST(req: Request, { params }: Params) {
  const data = await req.json();
  const { groupId, wsId } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  const { withoutPermission } = permissions;
  if (withoutPermission('create_user_groups_posts')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to create user group posts' },
      { status: 403 }
    );
  }

  const supabase = await createAdminClient();
  const { error } = await supabase.from('user_group_posts').insert({
    ...data,
    group_id: groupId,
  });

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating group post' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
