import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { resolveWorkspaceRouteAccess } from '@/lib/workspace-route-access';

interface Params {
  params: Promise<{
    roleId: string;
    userId: string;
    wsId: string;
  }>;
}

export async function DELETE(req: Request, { params }: Params) {
  const { roleId, userId, wsId } = await params;
  const access = await resolveWorkspaceRouteAccess(req, wsId, [
    'manage_workspace_roles',
  ]);
  if (!access.ok) return access.response;

  const supabase = await createAdminClient({ noCookie: true });

  const { data: role } = await supabase
    .from('workspace_roles')
    .select('id')
    .eq('id', roleId)
    .eq('ws_id', access.permissions.wsId)
    .maybeSingle();
  if (!role) {
    return NextResponse.json({ message: 'Role not found' }, { status: 404 });
  }

  const { error } = await supabase
    .from('workspace_role_members')
    .delete()
    .eq('role_id', roleId)
    .eq('user_id', userId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error removing role member' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
