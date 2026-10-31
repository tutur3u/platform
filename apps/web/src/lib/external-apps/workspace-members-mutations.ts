import type { TablesInsert } from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import { roleHasCreatorGrantPermission } from '@/lib/workspace-creator-grant-permissions';
import { getWorkspaceMembers } from '@/lib/workspace-members';
import type { ExternalAppWorkspaceMembersAccess } from './workspace-members';
import {
  ADMIN_PERMISSION_SET,
  ADMIN_ROLE_NAME,
  defaultAdminSchema,
  MEMBER_DEFAULT_TYPE,
  removeAccessSchema,
  rolePatchSchema,
} from './workspace-members-constants';
import {
  type ExternalAppWorkspaceMember,
  normalizeWorkspaceMembers,
  roleAdminSources,
} from './workspace-members-model';

async function getWorkspaceMemberSnapshot(
  access: ExternalAppWorkspaceMembersAccess
) {
  const members = await getWorkspaceMembers({
    sbAdmin: access.admin,
    status: 'all',
    supabase: access.admin,
    wsId: access.normalizedWorkspaceId,
  });

  return normalizeWorkspaceMembers({
    currentUserId: access.user.id,
    members,
  });
}

function effectiveAdminCount(members: ExternalAppWorkspaceMember[]) {
  return members.filter((member) => member.role === 'admin').length;
}

function assertCanMutateMember({
  access,
  member,
}: {
  access: ExternalAppWorkspaceMembersAccess;
  member: ExternalAppWorkspaceMember | null;
}) {
  if (!member) {
    return NextResponse.json({ message: 'Member not found' }, { status: 404 });
  }

  if (member.isCreator) {
    return NextResponse.json(
      { message: 'Workspace creator access cannot be changed here' },
      { status: 403 }
    );
  }

  if (member.id === access.user.id) {
    return NextResponse.json(
      { message: 'Cannot change your own access' },
      { status: 403 }
    );
  }

  return null;
}

export async function removeExternalAppWorkspaceMember({
  access,
  request,
}: {
  access: ExternalAppWorkspaceMembersAccess;
  request: Request;
}) {
  const validation = removeAccessSchema.safeParse(await request.json());

  if (!validation.success) {
    return NextResponse.json(
      { message: 'Missing member identifier' },
      { status: 400 }
    );
  }

  const { email, userId } = validation.data;
  const snapshot = await getWorkspaceMemberSnapshot(access);
  const member = userId
    ? (snapshot.members.find((entry) => entry.id === userId) ?? null)
    : null;

  if (member) {
    const mutationError = assertCanMutateMember({ access, member });
    if (mutationError) return mutationError;

    const nextMembers = snapshot.members.filter((entry) => entry.id !== userId);
    if (effectiveAdminCount(nextMembers) === 0) {
      return NextResponse.json(
        { message: 'At least one workspace admin is required' },
        { status: 403 }
      );
    }
  }

  let inviteUserIds: string[] = [];

  if (email) {
    const { data, error } = await access.admin
      .from('workspace_members_and_invites')
      .select('id')
      .eq('ws_id', access.normalizedWorkspaceId)
      .eq('email', email);

    if (error) {
      console.error('Error resolving external app invite identities', {
        error,
        wsId: access.normalizedWorkspaceId,
      });
      return NextResponse.json(
        { message: 'Error removing workspace access' },
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

  const emailInviteQuery = email
    ? access.admin
        .from('workspace_email_invites')
        .delete()
        .eq('ws_id', access.normalizedWorkspaceId)
        .eq('email', email)
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
    console.error('Error removing external app workspace member', {
      emailInviteError: emailInviteResult.error,
      inviteError: inviteResult.error,
      memberError: memberResult.error,
      wsId: access.normalizedWorkspaceId,
    });
    return NextResponse.json(
      { message: 'Error removing workspace access' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

async function getOrCreateAdminRole(access: ExternalAppWorkspaceMembersAccess) {
  const { data: existing, error: existingError } = await access.admin
    .from('workspace_roles')
    .select('id,ws_id')
    .eq('ws_id', access.normalizedWorkspaceId)
    .eq('name', ADMIN_ROLE_NAME)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existing?.id && existing.ws_id === access.normalizedWorkspaceId) {
    return existing.id;
  }
  if (existing?.id) throw new Error('admin_role_workspace_mismatch');

  const { data: role, error: roleError } = await access.admin
    .from('workspace_roles')
    .insert({
      name: ADMIN_ROLE_NAME,
      ws_id: access.normalizedWorkspaceId,
    } satisfies TablesInsert<'workspace_roles'>)
    .select('id,ws_id')
    .single();

  if (roleError || !role?.id || role.ws_id !== access.normalizedWorkspaceId) {
    throw roleError ?? new Error('admin_role_create_failed');
  }

  return role.id;
}

async function ensureAdminRolePermissions({
  access,
  roleId,
}: {
  access: ExternalAppWorkspaceMembersAccess;
  roleId: string;
}) {
  const { error } = await access.admin
    .from('workspace_role_permissions')
    .upsert(
      ADMIN_PERMISSION_SET.map(
        (permission): TablesInsert<'workspace_role_permissions'> => ({
          enabled: true,
          permission,
          role_id: roleId,
          ws_id: access.normalizedWorkspaceId,
        })
      ),
      { onConflict: 'ws_id,role_id,permission' }
    );

  if (error) throw error;
}

async function promoteWorkspaceMember({
  access,
  userId,
}: {
  access: ExternalAppWorkspaceMembersAccess;
  userId: string;
}) {
  const roleId = await getOrCreateAdminRole(access);
  // Count disabled rows too: promotion rewrites this role's permissions.
  const roleHasCreatorGrant = await roleHasCreatorGrantPermission(
    access.admin,
    { includeDisabled: true, roleId, wsId: access.normalizedWorkspaceId }
  );

  if (roleHasCreatorGrant) {
    throw new Error('creator_grant_role_requires_creator');
  }

  await ensureAdminRolePermissions({ access, roleId });

  const { error } = await access.admin.from('workspace_role_members').upsert(
    {
      role_id: roleId,
      user_id: userId,
    },
    { onConflict: 'role_id,user_id' }
  );

  if (error) throw error;
}

async function disableDefaultAdmin(access: ExternalAppWorkspaceMembersAccess) {
  const { error } = await access.admin
    .from('workspace_default_permissions')
    .upsert(
      ADMIN_PERMISSION_SET.map(
        (permission): TablesInsert<'workspace_default_permissions'> => ({
          enabled: false,
          member_type: MEMBER_DEFAULT_TYPE,
          permission,
          ws_id: access.normalizedWorkspaceId,
        })
      ),
      { onConflict: 'ws_id,permission,member_type' }
    );

  if (error) throw error;
}

async function removeAdminRoleMemberships({
  access,
  roleIds,
  userId,
}: {
  access: ExternalAppWorkspaceMembersAccess;
  roleIds: string[];
  userId: string;
}) {
  if (roleIds.length === 0) return;

  const { error } = await access.admin
    .from('workspace_role_members')
    .delete()
    .eq('user_id', userId)
    .in('role_id', roleIds);

  if (error) throw error;
}

export async function updateExternalAppWorkspaceMemberRole({
  access,
  request,
  userId,
}: {
  access: ExternalAppWorkspaceMembersAccess;
  request: Request;
  userId: string;
}) {
  const validation = rolePatchSchema.safeParse(await request.json());

  if (!validation.success) {
    return NextResponse.json(
      { message: 'Invalid role payload' },
      { status: 400 }
    );
  }

  const snapshot = await getWorkspaceMemberSnapshot(access);
  const member = snapshot.members.find((entry) => entry.id === userId) ?? null;
  const mutationError = assertCanMutateMember({ access, member });

  if (mutationError) return mutationError;

  try {
    if (validation.data.role === 'admin') {
      await promoteWorkspaceMember({ access, userId });
    } else {
      if (
        snapshot.defaultAdminEnabled &&
        !validation.data.confirmDefaultAdminDisable
      ) {
        return NextResponse.json(
          {
            code: 'DEFAULT_ADMIN_ENABLED',
            message:
              'Default member admin access must be disabled before demotion',
          },
          { status: 409 }
        );
      }

      const nextMembers = snapshot.members.map((entry) =>
        entry.id === userId
          ? { ...entry, role: 'member' as const, roleSources: [] }
          : entry
      );
      const nextAfterDefaults = validation.data.confirmDefaultAdminDisable
        ? nextMembers.map((entry) =>
            entry.roleSources.includes('default')
              ? {
                  ...entry,
                  role: entry.roleSources.some((source) =>
                    ['creator', 'role'].includes(source)
                  )
                    ? entry.role
                    : ('member' as const),
                  roleSources: entry.roleSources.filter(
                    (source) => source !== 'default'
                  ),
                }
              : entry
          )
        : nextMembers;

      if (effectiveAdminCount(nextAfterDefaults) === 0) {
        return NextResponse.json(
          { message: 'At least one workspace admin is required' },
          { status: 403 }
        );
      }

      if (validation.data.confirmDefaultAdminDisable) {
        await disableDefaultAdmin(access);
      }

      const members = await getWorkspaceMembers({
        sbAdmin: access.admin,
        status: 'joined',
        supabase: access.admin,
        wsId: access.normalizedWorkspaceId,
      });
      const target = members.find((entry) => entry.id === userId);
      await removeAdminRoleMemberships({
        access,
        roleIds: target ? roleAdminSources(target) : [],
        userId,
      });
    }
  } catch (error) {
    console.error('Error updating external app workspace member role', {
      error,
      userId,
      wsId: access.normalizedWorkspaceId,
    });
    return NextResponse.json(
      { message: 'Error updating workspace role' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function updateExternalAppWorkspaceDefaultAdmin({
  access,
  request,
}: {
  access: ExternalAppWorkspaceMembersAccess;
  request: Request;
}) {
  const validation = defaultAdminSchema.safeParse(await request.json());

  if (!validation.success) {
    return NextResponse.json(
      { message: 'Invalid default admin payload' },
      { status: 400 }
    );
  }

  const snapshot = await getWorkspaceMemberSnapshot(access);
  const nextMembers = validation.data.enabled
    ? snapshot.members.map((member) => ({
        ...member,
        role: 'admin' as const,
        roleSources: [...new Set([...member.roleSources, 'default' as const])],
      }))
    : snapshot.members.map((member) => {
        const roleSources = member.roleSources.filter(
          (source) => source !== 'default'
        );
        return {
          ...member,
          role: roleSources.length > 0 ? member.role : ('member' as const),
          roleSources,
        };
      });

  if (!validation.data.enabled && effectiveAdminCount(nextMembers) === 0) {
    return NextResponse.json(
      { message: 'At least one workspace admin is required' },
      { status: 403 }
    );
  }

  const { error } = await access.admin
    .from('workspace_default_permissions')
    .upsert(
      ADMIN_PERMISSION_SET.map(
        (permission): TablesInsert<'workspace_default_permissions'> => ({
          enabled: validation.data.enabled,
          member_type: MEMBER_DEFAULT_TYPE,
          permission,
          ws_id: access.normalizedWorkspaceId,
        })
      ),
      { onConflict: 'ws_id,permission,member_type' }
    );

  if (error) {
    console.error('Error updating external app default admin access', {
      error,
      wsId: access.normalizedWorkspaceId,
    });
    return NextResponse.json(
      { message: 'Error updating default admin access' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
