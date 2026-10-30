import type {
  Database,
  TablesInsert,
  TablesUpdate,
  WorkspaceDefaultPermissionMemberType,
  WorkspaceDefaultPermissionsRole,
} from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import { getWorkspaceMembers } from '@/lib/workspace-members';
import {
  hasRootExternalProjectsAdminPermission,
  requireWorkspaceExternalProjectAccess,
  requireWorkspaceExternalProjectMemberBootstrapAccess,
} from './access';
import { attachExternalProjectInvitationRoles } from './team-invitations';
import { requireExternalProjectRoleInWorkspace } from './team-role-members';
import {
  type WorkspaceRolePayload,
  writableTeamRolePermissions,
} from './team-role-payload';

export {
  inviteExternalProjectTeamMembers,
  updateExternalProjectTeamInvitationRoles,
} from './team-invitations';
export {
  addExternalProjectRoleMembers,
  listExternalProjectRoleMembers,
  removeExternalProjectRoleMember,
} from './team-role-members';

type WorkspaceRolePermissionValue =
  Database['public']['Enums']['workspace_role_permission'];
type WorkspaceExternalProjectAccess = Extract<
  Awaited<ReturnType<typeof requireWorkspaceExternalProjectAccess>>,
  { ok: true }
>;
const DEFAULT_MEMBER_TYPES: WorkspaceDefaultPermissionMemberType[] = [
  'MEMBER',
  'GUEST',
];

export type ExternalProjectTeamAccess = WorkspaceExternalProjectAccess & {
  canManageMembers: boolean;
  canManageRoles: boolean;
};

function parseDefaultMemberType(
  value: string | null
): WorkspaceDefaultPermissionMemberType | null {
  if (!value) return 'MEMBER';
  if (
    DEFAULT_MEMBER_TYPES.includes(value as WorkspaceDefaultPermissionMemberType)
  ) {
    return value as WorkspaceDefaultPermissionMemberType;
  }
  return null;
}

function canManageTeamMembers(access: WorkspaceExternalProjectAccess) {
  return (
    hasRootExternalProjectsAdminPermission(access.rootPermissions) ||
    Boolean(
      access.workspacePermissions?.containsPermission(
        'manage_workspace_members'
      )
    )
  );
}

function canManageTeamRoles(access: WorkspaceExternalProjectAccess) {
  return (
    hasRootExternalProjectsAdminPermission(access.rootPermissions) ||
    Boolean(
      access.workspacePermissions?.containsPermission('manage_workspace_roles')
    )
  );
}

export async function requireExternalProjectTeamAccess({
  capability = 'view',
  request,
  wsId,
}: {
  capability?: 'manage-members' | 'manage-roles' | 'view';
  request: Request;
  wsId: string;
}) {
  let access = await requireWorkspaceExternalProjectAccess({
    mode: 'read',
    request,
    wsId,
  });

  if (
    !access.ok &&
    capability === 'manage-members' &&
    access.response.status === 403
  ) {
    access = await requireWorkspaceExternalProjectMemberBootstrapAccess({
      request,
      wsId,
    });
  }

  if (!access.ok) {
    return access;
  }

  const canManageMembers = canManageTeamMembers(access);
  const canManageRoles = canManageTeamRoles(access);
  const authorized =
    capability === 'view' ||
    (capability === 'manage-members' && canManageMembers) ||
    (capability === 'manage-roles' && canManageRoles);

  if (!authorized) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  return {
    ...access,
    canManageMembers,
    canManageRoles,
  };
}

export function getExternalProjectTeamContext(
  access: ExternalProjectTeamAccess
) {
  return {
    boundProjectName: access.binding.canonical_project?.display_name ?? null,
    canManageMembers: access.canManageMembers,
    canManageRoles: access.canManageRoles,
    currentUserEmail: access.user.email ?? null,
    workspaceId: access.normalizedWorkspaceId,
  };
}

export async function listExternalProjectTeamMembers({
  access,
  status,
}: {
  access: ExternalProjectTeamAccess;
  status?: string | null;
}) {
  const members = await getWorkspaceMembers({
    sbAdmin: access.admin,
    status,
    supabase: access.admin,
    wsId: access.normalizedWorkspaceId,
  });

  return attachExternalProjectInvitationRoles({ access, members });
}

export async function removeExternalProjectTeamMember({
  access,
  request,
}: {
  access: ExternalProjectTeamAccess;
  request: Request;
}) {
  const searchParams = new URL(request.url).searchParams;
  const userId = searchParams.get('id');
  const userEmail = searchParams.get('email')?.trim() || null;

  if (!userId && !userEmail) {
    return NextResponse.json(
      { message: 'Missing member identifier' },
      { status: 400 }
    );
  }

  let inviteUserIds: string[] = [];

  if (userEmail) {
    const { data, error } = await access.admin
      .from('workspace_members_and_invites')
      .select('id')
      .eq('ws_id', access.normalizedWorkspaceId)
      .eq('email', userEmail);

    if (error) {
      console.error('Error resolving CMS team invite identities', {
        error,
        wsId: access.normalizedWorkspaceId,
      });
      return NextResponse.json(
        { message: 'Error removing team member' },
        { status: 500 }
      );
    }

    inviteUserIds = (data ?? [])
      .map((row) => row.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
  }

  const inviteQuery = userId
    ? access.admin
        .from('workspace_invites')
        .delete()
        .eq('ws_id', access.normalizedWorkspaceId)
        .eq('user_id', userId)
    : inviteUserIds.length > 0
      ? access.admin
          .from('workspace_invites')
          .delete()
          .eq('ws_id', access.normalizedWorkspaceId)
          .in('user_id', inviteUserIds)
      : { error: undefined };

  const emailInviteQuery = userEmail
    ? access.admin
        .from('workspace_email_invites')
        .delete()
        .eq('ws_id', access.normalizedWorkspaceId)
        .eq('email', userEmail)
    : { error: undefined };

  const memberQuery = userId
    ? access.admin
        .from('workspace_members')
        .delete()
        .eq('ws_id', access.normalizedWorkspaceId)
        .eq('user_id', userId)
    : { error: undefined };

  const [inviteResult, emailInviteResult, memberResult] = await Promise.all([
    inviteQuery,
    emailInviteQuery,
    memberQuery,
  ]);

  if (inviteResult.error || emailInviteResult.error || memberResult.error) {
    console.error('Error removing CMS team member', {
      emailInviteError: emailInviteResult.error,
      inviteError: inviteResult.error,
      memberError: memberResult.error,
      wsId: access.normalizedWorkspaceId,
    });
    return NextResponse.json(
      { message: 'Error removing team member' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success', workspace_deleted: false });
}

export async function listExternalProjectTeamRoles(
  access: ExternalProjectTeamAccess
) {
  const { data, error } = await access.admin
    .from('workspace_roles')
    .select(
      'id, name, permissions:workspace_role_permissions(id:permission, enabled), created_at'
    )
    .eq('ws_id', access.normalizedWorkspaceId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching CMS team roles', {
      error,
      wsId: access.normalizedWorkspaceId,
    });
    throw error;
  }

  return data ?? [];
}

export async function getExternalProjectTeamRole({
  access,
  roleId,
}: {
  access: ExternalProjectTeamAccess;
  roleId: string;
}) {
  const { data, error } = await access.admin
    .from('workspace_roles')
    .select(
      'id, name, permissions:workspace_role_permissions(id:permission, enabled), created_at'
    )
    .eq('id', roleId)
    .eq('ws_id', access.normalizedWorkspaceId)
    .single();

  if (error) {
    console.error('Error fetching CMS team role', {
      error,
      roleId,
      wsId: access.normalizedWorkspaceId,
    });
    throw error;
  }

  return data;
}

export async function createExternalProjectTeamRole({
  access,
  payload,
}: {
  access: ExternalProjectTeamAccess;
  payload: WorkspaceRolePayload;
}) {
  if (!payload?.permissions) {
    return NextResponse.json(
      { message: 'No permissions provided' },
      { status: 400 }
    );
  }

  const permissions = await writableTeamRolePermissions(
    access,
    payload.permissions
  );
  const { data: role, error: roleError } = await access.admin
    .from('workspace_roles')
    .insert({
      name: payload.name,
      ws_id: access.normalizedWorkspaceId,
    } satisfies TablesInsert<'workspace_roles'>)
    .select('id')
    .single();

  if (roleError) {
    console.error('Error creating CMS team role', {
      error: roleError,
      wsId: access.normalizedWorkspaceId,
    });
    return NextResponse.json(
      { message: 'Error creating access level' },
      { status: 500 }
    );
  }

  const { error: permissionsError } = await access.admin
    .from('workspace_role_permissions')
    .insert(
      permissions.map(
        (permission): TablesInsert<'workspace_role_permissions'> => ({
          enabled: permission.enabled,
          permission: permission.id as WorkspaceRolePermissionValue,
          role_id: role.id,
          ws_id: access.normalizedWorkspaceId,
        })
      )
    );

  if (permissionsError) {
    await access.admin.from('workspace_roles').delete().eq('id', role.id);
    console.error('Error creating CMS team role permissions', {
      error: permissionsError,
      roleId: role.id,
      wsId: access.normalizedWorkspaceId,
    });
    return NextResponse.json(
      { message: 'Error creating access level permissions' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function updateExternalProjectTeamRole({
  access,
  payload,
  roleId,
}: {
  access: ExternalProjectTeamAccess;
  payload: WorkspaceRolePayload;
  roleId: string;
}) {
  if (!payload?.permissions) {
    return NextResponse.json(
      { message: 'No permissions provided' },
      { status: 400 }
    );
  }

  const roleAccess = await requireExternalProjectRoleInWorkspace({
    access,
    roleId,
  });

  if (!roleAccess.ok) {
    return roleAccess.response;
  }

  const permissions = await writableTeamRolePermissions(
    access,
    payload.permissions
  );
  const roleQuery = access.admin
    .from('workspace_roles')
    .update({ name: payload.name } satisfies TablesUpdate<'workspace_roles'>)
    .eq('id', roleId)
    .eq('ws_id', access.normalizedWorkspaceId);

  const permissionsQuery = access.admin
    .from('workspace_role_permissions')
    .upsert(
      permissions.map(
        (permission): TablesInsert<'workspace_role_permissions'> => ({
          enabled: permission.enabled,
          permission: permission.id as WorkspaceRolePermissionValue,
          role_id: roleId,
          ws_id: access.normalizedWorkspaceId,
        })
      ),
      { onConflict: 'ws_id,role_id,permission' }
    );

  const [roleResult, permissionsResult] = await Promise.all([
    roleQuery,
    permissionsQuery,
  ]);

  if (roleResult.error || permissionsResult.error) {
    console.error('Error updating CMS team role', {
      permissionsError: permissionsResult.error,
      roleError: roleResult.error,
      roleId,
      wsId: access.normalizedWorkspaceId,
    });
    return NextResponse.json(
      { message: 'Error updating access level' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function deleteExternalProjectTeamRole({
  access,
  roleId,
}: {
  access: ExternalProjectTeamAccess;
  roleId: string;
}) {
  const { error } = await access.admin
    .from('workspace_roles')
    .delete()
    .eq('id', roleId)
    .eq('ws_id', access.normalizedWorkspaceId);

  if (error) {
    console.error('Error deleting CMS team role', {
      error,
      roleId,
      wsId: access.normalizedWorkspaceId,
    });
    return NextResponse.json(
      { message: 'Error deleting access level' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function getExternalProjectTeamDefaultPermissions({
  access,
  memberType,
}: {
  access: ExternalProjectTeamAccess;
  memberType: WorkspaceDefaultPermissionMemberType;
}) {
  const { data, error } = await access.admin
    .from('workspace_default_permissions')
    .select('id:permission, enabled')
    .eq('ws_id', access.normalizedWorkspaceId)
    .eq('member_type', memberType)
    .order('permission', { ascending: true });

  if (error) {
    console.error('Error fetching CMS team default permissions', {
      error,
      memberType,
      wsId: access.normalizedWorkspaceId,
    });
    throw error;
  }

  return {
    id: 'DEFAULT',
    member_type: memberType,
    name: `${memberType}_DEFAULT`,
    permissions: data ?? [],
  } satisfies WorkspaceDefaultPermissionsRole;
}

export async function updateExternalProjectTeamDefaultPermissions({
  access,
  memberType,
  payload,
}: {
  access: ExternalProjectTeamAccess;
  memberType: WorkspaceDefaultPermissionMemberType;
  payload: Pick<WorkspaceDefaultPermissionsRole, 'permissions'>;
}) {
  if (!payload?.permissions) {
    return NextResponse.json(
      { message: 'No permissions provided' },
      { status: 400 }
    );
  }

  const permissions = await writableTeamRolePermissions(
    access,
    payload.permissions
  );
  const { error } = await access.admin
    .from('workspace_default_permissions')
    .upsert(
      permissions.map(
        (permission): TablesInsert<'workspace_default_permissions'> => ({
          enabled: permission.enabled,
          member_type: memberType,
          permission: permission.id as WorkspaceRolePermissionValue,
          ws_id: access.normalizedWorkspaceId,
        })
      ),
      { onConflict: 'ws_id,permission,member_type' }
    );

  if (error) {
    console.error('Error updating CMS team default permissions', {
      error,
      memberType,
      wsId: access.normalizedWorkspaceId,
    });
    return NextResponse.json(
      { message: 'Error updating default access' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function parseExternalProjectTeamMemberType(request: Request) {
  const memberType = parseDefaultMemberType(
    new URL(request.url).searchParams.get('memberType')
  );

  if (!memberType) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { message: 'Invalid memberType. Use MEMBER or GUEST.' },
        { status: 400 }
      ),
    };
  }

  return { memberType, ok: true as const };
}

export function createRouteErrorResponse(message: string, error: unknown) {
  console.error(message, { error });
  return NextResponse.json({ message }, { status: 500 });
}
