import {
  GUARD_WORKSPACE_SELF_REMOVAL,
  lastManagerResponse,
} from '@tuturuuu/apis/members/guarded-removal';
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

  try {
    const { data, error } = await supabase.rpc(
      'remove_workspace_role_member_guarded_in_mode',
      {
        p_actor_id: access.user.id,
        p_guard_self: GUARD_WORKSPACE_SELF_REMOVAL,
        p_mode: 'workspace',
        p_role_id: role.id,
        p_user_id: userId,
        p_ws_id: access.permissions.wsId,
      }
    );
    if (error) throw error;

    switch (data) {
      case 'removed':
      case 'not_found':
        return NextResponse.json({ message: 'success' });
      case 'forbidden':
        return NextResponse.json(
          { message: 'Workspace permission denied' },
          { status: 403 }
        );
      case 'last_manager':
        return lastManagerResponse();
      default:
        throw new Error('Unexpected guarded role member removal response');
    }
  } catch (error) {
    console.error('Error removing workspace role member:', error);
    return NextResponse.json(
      { message: 'Error removing role member' },
      { status: 500 }
    );
  }
}
