import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    groupId: string;
    wsId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { groupId, wsId } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId });
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

  const { data, error, count } = await supabase
    .from('user_group_posts')
    .select('*', { count: 'exact' })
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching user group posts' },
      { status: 500 }
    );
  }

  return NextResponse.json({ data, count });
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const data = await req.json();
  const { groupId, wsId } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId });
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
