import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    postId: string;
    wsId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const data = await req.json();
  const { postId, wsId } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId });
  if (!permissions) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  const { withoutPermission } = permissions;
  if (withoutPermission('update_user_groups_posts')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to update user group posts' },
      { status: 403 }
    );
  }

  const { error } = await supabase
    .from('user_group_posts')
    .update(data)
    .eq('id', postId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating workspace user group' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { postId, wsId } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId });
  if (!permissions) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  const { withoutPermission } = permissions;
  if (withoutPermission('delete_user_groups_posts')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to delete user group posts' },
      { status: 403 }
    );
  }

  const { error } = await supabase
    .from('user_group_posts')
    .delete()
    .eq('id', postId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting workspace user group' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
