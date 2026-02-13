import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    groupId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const data = await req.json();
  const { wsId, groupId } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId });
if (!permissions) {
  return Response.json({ error: 'Not found' }, { status: 404 });
}
const { withoutPermission } = permissions;
  if (withoutPermission('update_user_groups')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to update user groups' },
      { status: 403 }
    );
  }

  const { error } = await supabase
    .from('workspace_user_groups')
    .update(data)
    .eq('id', groupId);

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
  const { wsId, groupId } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId });
if (!permissions) {
  return Response.json({ error: 'Not found' }, { status: 404 });
}
const { withoutPermission } = permissions;
  if (withoutPermission('delete_user_groups')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to delete user groups' },
      { status: 403 }
    );
  }

  const { error } = await supabase
    .from('workspace_user_groups')
    .delete()
    .eq('id', groupId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting workspace user group' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
