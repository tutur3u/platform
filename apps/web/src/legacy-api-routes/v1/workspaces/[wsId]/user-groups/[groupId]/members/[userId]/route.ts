import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { revalidateUserGroupCache } from '@/lib/user-groups/revalidate';
import {
  resolveRequestActorAuthUid,
  resolveUserGroupRouteWorkspaceId,
} from '@/lib/user-groups/route-helpers';

interface Params {
  params: Promise<{
    groupId: string;
    userId: string;
    wsId: string;
  }>;
}

export async function DELETE(req: Request, { params }: Params) {
  const { groupId, userId, wsId } = await params;
  const normalizedWsId = await resolveUserGroupRouteWorkspaceId(wsId, req);

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
  const actorAuthUid = await resolveRequestActorAuthUid(req);

  const { data: deletedMember, error } = await sbAdmin
    .schema('private')
    .rpc('admin_delete_workspace_user_group_member_with_audit_actor', {
      p_ws_id: normalizedWsId,
      p_group_id: groupId,
      p_user_id: userId,
      p_actor_auth_uid: actorAuthUid ?? undefined,
    });

  if (error) {
    console.error('Error removing group member:', error);
    return NextResponse.json(
      { message: 'Error removing group member' },
      { status: 500 }
    );
  }

  if (!deletedMember) {
    return NextResponse.json(
      { message: 'Group member not found' },
      { status: 404 }
    );
  }

  revalidateUserGroupCache(groupId);
  return NextResponse.json({ message: 'success' });
}
