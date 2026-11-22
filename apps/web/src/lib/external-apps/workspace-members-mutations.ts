import {
  GUARD_WORKSPACE_SELF_REMOVAL,
  lastManagerResponse,
} from '@tuturuuu/apis/members/guarded-removal';
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

function externalMemberRemovalRefusal(
  result:
    | 'creator_protected'
    | 'self_protected'
    | 'last_admin'
    | 'last_manager'
    | 'forbidden'
) {
  switch (result) {
    case 'creator_protected':
      return NextResponse.json(
        { message: 'Workspace creator access cannot be changed here' },
        { status: 403 }
      );
    case 'self_protected':
      return NextResponse.json(
        { message: 'Cannot change your own access' },
        { status: 403 }
      );
    case 'last_admin':
      return NextResponse.json(
        { message: 'At least one workspace admin is required' },
        { status: 403 }
      );
    case 'last_manager':
      return lastManagerResponse();
    case 'forbidden':
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
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

  if (member.isCreator)
    return externalMemberRemovalRefusal('creator_protected');
  if (member.id === access.user.id)
    return externalMemberRemovalRefusal('self_protected');

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
  if (userId) {
    try {
      const { data, error } = await access.admin.rpc(
        'remove_workspace_member_guarded_in_mode',
        {
          p_actor_id: access.user.id,
          p_guard_self: GUARD_WORKSPACE_SELF_REMOVAL,
          p_mode: 'external_app',
          p_user_id: userId,
          p_ws_id: access.normalizedWorkspaceId,
        }
      );
      if (error) throw error;

      switch (data) {
        case 'removed':
          break;
        case 'not_found': {
          const snapshot = await getWorkspaceMemberSnapshot(access);
          // Direct board guests can be listed without a workspace membership.
          const member = snapshot.members.find((entry) => entry.id === userId);
          if (
            member &&
            !snapshot.members.some(
              (entry) => entry.id !== userId && entry.role === 'admin'
            )
          ) {
            return externalMemberRemovalRefusal('last_admin');
          }
          break;
        }
        case 'creator_protected':
        case 'self_protected':
        case 'last_admin':
        case 'last_manager':
        case 'forbidden':
          return externalMemberRemovalRefusal(data);
        default:
          throw new Error(
            'Unexpected guarded external member removal response'
          );
      }
    } catch (error) {
      console.error('Error removing external app workspace member', {
        error,
        wsId: access.normalizedWorkspaceId,
      });
      return NextResponse.json(
        { message: 'Error removing workspace access' },
        { status: 500 }
      );
    }
  }

  let inviteUserIds: string[] = [];

  if (email && !userId) {
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

  const [inviteResult, emailInviteResult] = await Promise.all([
    inviteQuery,
    emailInviteQuery,
  ]);

  if (inviteResult.error || emailInviteResult.error) {
    console.error('Error removing external app workspace member', {
      emailInviteError: emailInviteResult.error,
      inviteError: inviteResult.error,
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

async function reduceExternalAppAdmin({
  access,
  disableDefaultAdmin,
  userId,
}: {
  access: ExternalAppWorkspaceMembersAccess;
  disableDefaultAdmin: boolean;
  userId?: string;
}) {
  try {
    const { data, error } = await access.admin.rpc(
      'reduce_external_app_workspace_admin_guarded',
      {
        p_actor_id: access.user.id,
        p_disable_default_admin: disableDefaultAdmin,
        p_ws_id: access.normalizedWorkspaceId,
        ...(userId ? { p_user_id: userId } : {}),
      }
    );
    if (error) throw error;

    switch (data) {
      case 'removed':
        return NextResponse.json({ message: 'success' });
      case 'last_admin':
      case 'last_manager':
      case 'forbidden':
        return externalMemberRemovalRefusal(data);
      case 'creator_protected':
      case 'self_protected':
        if (userId) return externalMemberRemovalRefusal(data);
        break;
      case 'not_found':
        if (userId) {
          return NextResponse.json(
            { message: 'Member not found' },
            { status: 404 }
          );
        }
        break;
      case 'default_admin_enabled':
        if (userId) {
          return NextResponse.json(
            {
              code: 'DEFAULT_ADMIN_ENABLED',
              message:
                'Default member admin access must be disabled before demotion',
            },
            { status: 409 }
          );
        }
        break;
    }

    throw new Error('Unexpected guarded external admin reduction response');
  } catch (error) {
    console.error('Error reducing external app workspace admin access', {
      error,
      userId,
      wsId: access.normalizedWorkspaceId,
    });
    return NextResponse.json(
      {
        message: userId
          ? 'Error updating workspace role'
          : 'Error updating default admin access',
      },
      { status: 500 }
    );
  }
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

  if (validation.data.role === 'member') {
    return reduceExternalAppAdmin({
      access,
      disableDefaultAdmin: validation.data.confirmDefaultAdminDisable === true,
      userId,
    });
  }

  try {
    await promoteWorkspaceMember({ access, userId });
  } catch (error) {
    // The database refuses roles for users without a MEMBER membership.
    if ((error as { code?: unknown } | null)?.code === '42501') {
      return NextResponse.json(
        { message: 'Only workspace members can hold workspace roles' },
        { status: 403 }
      );
    }
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

  if (!validation.data.enabled) {
    return reduceExternalAppAdmin({ access, disableDefaultAdmin: true });
  }

  const { error } = await access.admin
    .from('workspace_default_permissions')
    .upsert(
      ADMIN_PERMISSION_SET.map(
        (permission): TablesInsert<'workspace_default_permissions'> => ({
          enabled: true,
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
