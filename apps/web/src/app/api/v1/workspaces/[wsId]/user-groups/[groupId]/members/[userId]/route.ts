import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    groupId: string;
    userId: string;
    wsId: string;
  }>;
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { groupId, userId, wsId } = await params;

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
    .from('workspace_user_groups_users')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error removing group member' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
