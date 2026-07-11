import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getGroupMembersPage } from '@tuturuuu/users-core/lib/user-groups/server-data';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { revalidateUserGroupCache } from '@/lib/user-groups/revalidate';
import {
  hasUserGroupInWorkspace,
  resolveRequestActorAuthUid,
  resolveUserGroupRouteWorkspaceId,
} from '@/lib/user-groups/route-helpers';

const UpsertGroupMembersSchema = z.object({
  memberIds: z.array(z.string().uuid()).min(1),
  role: z.enum(['STUDENT', 'TEACHER']).default('STUDENT'),
});

interface Params {
  params: Promise<{
    groupId: string;
    wsId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { groupId, wsId } = await params;
  const normalizedWsId = await resolveUserGroupRouteWorkspaceId(wsId, req);
  const { searchParams } = new URL(req.url);
  const offset = Number.parseInt(searchParams.get('offset') ?? '0', 10);
  const limit = Number.parseInt(searchParams.get('limit') ?? '10', 10);

  // Check permissions
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
  const canViewPersonalInfo = permissions.containsPermission(
    'view_users_private_info'
  );
  const canViewPublicInfo = permissions.containsPermission(
    'view_users_public_info'
  );

  const sbAdmin = await createAdminClient();
  const groupExists = await hasUserGroupInWorkspace({
    sbAdmin,
    wsId: normalizedWsId,
    groupId,
  });

  if (!groupExists) {
    return NextResponse.json(
      { message: 'Workspace user group not found' },
      { status: 404 }
    );
  }

  try {
    const page = await getGroupMembersPage({
      sbAdmin,
      wsId: normalizedWsId,
      groupId,
      offset,
      limit,
      canViewPersonalInfo,
      canViewPublicInfo,
    });

    return NextResponse.json(page);
  } catch (error) {
    console.error('Error fetching group members:', error);
    return NextResponse.json(
      { message: 'Error fetching group members' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request, { params }: Params) {
  const { groupId, wsId } = await params;
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

  const data = UpsertGroupMembersSchema.safeParse(await req.json());

  if (!data.success) {
    return NextResponse.json(
      { message: 'Invalid request', errors: data.error.issues },
      { status: 400 }
    );
  }

  const sbAdmin = await createAdminClient();
  const actorAuthUid = await resolveRequestActorAuthUid(req);

  const { error: groupError } = await sbAdmin
    .schema('private')
    .rpc('admin_upsert_workspace_user_group_members_with_audit_actor', {
      p_ws_id: normalizedWsId,
      p_group_id: groupId,
      p_user_ids: data.data.memberIds,
      p_role: data.data.role,
      p_actor_auth_uid: actorAuthUid ?? undefined,
    });

  if (groupError) {
    console.error('Error adding new members to group:', groupError);
    return NextResponse.json(
      { message: 'Error adding new members to group' },
      { status: 500 }
    );
  }

  revalidateUserGroupCache(groupId);
  return NextResponse.json({ message: 'success' });
}
