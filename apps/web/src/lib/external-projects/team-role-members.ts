import { NextResponse } from 'next/server';
import {
  isWorkspaceCreator,
  roleHasCreatorGrantPermission,
} from '@/lib/workspace-creator-grant-permissions';
import { addWorkspaceRoleMembers } from '@/lib/workspace-role-member-mutations';
import { normalizeRoleMembers } from '@/lib/workspace-role-members';
import type { ExternalProjectTeamAccess } from './team-access';

export async function requireExternalProjectRoleInWorkspace({
  access,
  roleId,
}: {
  access: ExternalProjectTeamAccess;
  roleId: string;
}) {
  const { data: role, error } = await access.admin
    .from('workspace_roles')
    .select('id')
    .eq('id', roleId)
    .eq('ws_id', access.normalizedWorkspaceId)
    .single();

  if (error || !role) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { message: 'Access level not found' },
        { status: 404 }
      ),
    };
  }

  return { ok: true as const };
}

export async function addExternalProjectRoleMembers({
  access,
  request,
  roleId,
}: {
  access: ExternalProjectTeamAccess;
  request: Request;
  roleId: string;
}) {
  const roleAccess = await requireExternalProjectRoleInWorkspace({
    access,
    roleId,
  });

  if (!roleAccess.ok) {
    return roleAccess.response;
  }

  // The admin client bypasses the database member guard, so check here that
  // only the workspace creator hands out a creator-grant permission.
  if (
    (await roleHasCreatorGrantPermission(access.admin, {
      roleId,
      wsId: access.normalizedWorkspaceId,
    })) &&
    !(await isWorkspaceCreator(
      access.admin,
      access.normalizedWorkspaceId,
      access.user.id
    ))
  ) {
    return NextResponse.json(
      {
        message:
          'Only the workspace creator can add people to an access level that manages billing.',
      },
      { status: 403 }
    );
  }

  return addWorkspaceRoleMembers({
    request,
    admin: access.admin,
    wsId: access.normalizedWorkspaceId,
    roleId,
  });
}

export async function listExternalProjectRoleMembers({
  access,
  roleId,
}: {
  access: ExternalProjectTeamAccess;
  roleId: string;
}) {
  const roleAccess = await requireExternalProjectRoleInWorkspace({
    access,
    roleId,
  });

  if (!roleAccess.ok) {
    return roleAccess.response;
  }

  const { data, error, count } = await access.admin
    .from('workspace_role_members')
    .select(
      'user_id, users:user_id(id, display_name, avatar_url, user_private_details(email))',
      { count: 'exact' }
    )
    .eq('role_id', roleId);

  if (error) {
    console.error('Error fetching CMS team role members', {
      error,
      roleId,
      wsId: access.normalizedWorkspaceId,
    });
    return NextResponse.json(
      { message: 'Error loading access level people' },
      { status: 500 }
    );
  }

  const members = normalizeRoleMembers(
    data as Parameters<typeof normalizeRoleMembers>[0]
  ).map((member) => ({
    avatar_url: member.avatar_url,
    display_name: member.display_name,
    email: member.email,
    full_name: member.full_name ?? null,
    id: member.id,
  }));

  return NextResponse.json({ count: count ?? members.length, data: members });
}

export async function removeExternalProjectRoleMember({
  access,
  roleId,
  userId,
}: {
  access: ExternalProjectTeamAccess;
  roleId: string;
  userId: string;
}) {
  const roleAccess = await requireExternalProjectRoleInWorkspace({
    access,
    roleId,
  });

  if (!roleAccess.ok) {
    return roleAccess.response;
  }

  const { error } = await access.admin
    .from('workspace_role_members')
    .delete()
    .eq('role_id', roleId)
    .eq('user_id', userId);

  if (error) {
    console.error('Error removing CMS team role member', {
      error,
      roleId,
      userId,
      wsId: access.normalizedWorkspaceId,
    });
    return NextResponse.json(
      { message: 'Error removing access level person' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
