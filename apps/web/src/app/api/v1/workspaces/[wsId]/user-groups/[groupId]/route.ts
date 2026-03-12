import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    groupId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId, groupId } = await params;

  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  const { withoutPermission } = permissions;
  if (withoutPermission('view_user_groups')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to view user groups' },
      { status: 403 }
    );
  }

  const sbAdmin = await createAdminClient();
  const { data, error } = await sbAdmin
    .from('workspace_user_groups')
    .select('id, name, sessions, starting_date, ending_date')
    .eq('ws_id', wsId)
    .eq('id', groupId)
    .maybeSingle();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching workspace user group' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { message: 'Workspace user group not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({ data });
}

export async function PUT(req: Request, { params }: Params) {
  const data = await req.json();
  const { wsId, groupId } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
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

  const sbAdmin = await createAdminClient();

  const { error } = await sbAdmin
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

export async function DELETE(req: Request, { params }: Params) {
  const { wsId, groupId } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
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

  const sbAdmin = await createAdminClient();

  const { error } = await sbAdmin
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
