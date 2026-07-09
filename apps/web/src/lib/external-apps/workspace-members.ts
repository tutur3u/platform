import {
  getBearerAppCoordinationToken,
  verifyAppCoordinationToken,
} from '@tuturuuu/auth/app-coordination';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type {
  Database,
  TablesInsert,
  WorkspaceDefaultPermissionMemberType,
} from '@tuturuuu/types';
import {
  MAX_EMAIL_LENGTH,
  PERSONAL_WORKSPACE_SLUG,
  ROOT_WORKSPACE_ID,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';
import {
  getPermissions,
  type PermissionsResult,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { validate as validateUUID } from 'uuid';
import { z } from 'zod';
import { getExternalAppById } from '@/lib/app-coordination/external-apps';
import {
  type EnhancedWorkspaceMember,
  getWorkspaceMembers,
} from '@/lib/workspace-members';
import { getEffectiveAvailableSeats } from '@tuturuuu/payment-core/seat-limits';

type AdminDb = TypedSupabaseClient;
type WorkspaceRolePermissionValue =
  Database['public']['Enums']['workspace_role_permission'];

const ADMIN_ROLE_NAME = 'External App Admin';
const WORKSPACE_MEMBERS_READ_SCOPE = 'workspace:members:read';
const WORKSPACE_MEMBERS_WRITE_SCOPE = 'workspace:members:write';
const WORKSPACE_ROLES_READ_SCOPE = 'workspace:roles:read';
const WORKSPACE_ROLES_WRITE_SCOPE = 'workspace:roles:write';
const ADMIN_PERMISSION_SET = [
  'manage_workspace_members',
  'manage_workspace_roles',
] as const satisfies readonly WorkspaceRolePermissionValue[];
const ADMIN_PERMISSION_LOOKUP = new Set<WorkspaceRolePermissionValue>(
  ADMIN_PERMISSION_SET
);
const BROAD_ADMIN_PERMISSION = 'admin' satisfies WorkspaceRolePermissionValue;
const MEMBER_DEFAULT_TYPE =
  'MEMBER' satisfies WorkspaceDefaultPermissionMemberType;

const inviteSchema = z.object({
  emails: z.array(z.string().email().max(MAX_EMAIL_LENGTH)).min(1).max(50),
});

const removeAccessSchema = z
  .object({
    email: z.string().email().max(MAX_EMAIL_LENGTH).optional(),
    userId: z.string().trim().min(1).max(128).optional(),
  })
  .refine((value) => Boolean(value.email || value.userId), {
    message: 'Missing member identifier',
  });

const rolePatchSchema = z.object({
  confirmDefaultAdminDisable: z.boolean().optional(),
  role: z.enum(['admin', 'member']),
});

const defaultAdminSchema = z.object({
  enabled: z.boolean(),
});

type RequiredScope =
  | typeof WORKSPACE_MEMBERS_READ_SCOPE
  | typeof WORKSPACE_MEMBERS_WRITE_SCOPE
  | typeof WORKSPACE_ROLES_READ_SCOPE
  | typeof WORKSPACE_ROLES_WRITE_SCOPE;

type Capability = 'manage-members' | 'manage-roles' | 'view';

export type ExternalAppWorkspaceMembersAccess = {
  admin: AdminDb;
  canManageMembers: boolean;
  canManageRoles: boolean;
  normalizedWorkspaceId: string;
  permissions: PermissionsResult;
  targetApp: string;
  user: {
    email: string | null;
    id: string;
  };
};

type WorkspaceMembersSnapshot = {
  defaultAdminEnabled: boolean;
  invitations: Array<{ createdAt: string | null; email: string }>;
  members: ExternalAppWorkspaceMember[];
};

type ExternalAppWorkspaceMember = {
  avatarUrl: string | null;
  displayName: string | null;
  email: string | null;
  id: string;
  isCreator: boolean;
  isCurrentUser: boolean;
  role: 'admin' | 'member';
  roleSources: Array<'admin' | 'creator' | 'default' | 'role'>;
};

function hasScope(scopes: string[], requiredScope: RequiredScope) {
  if (scopes.includes('*') || scopes.includes(requiredScope)) return true;

  return scopes.some(
    (scope) =>
      scope.endsWith(':*') && requiredScope.startsWith(scope.slice(0, -1))
  );
}

function hasAdminPermission(
  permissions: Array<{ enabled?: boolean | null; permission?: string | null }>
) {
  const enabled = new Set(
    permissions
      .filter((permission) => permission.enabled !== false)
      .map((permission) => permission.permission)
      .filter(Boolean)
  );

  return (
    enabled.has(BROAD_ADMIN_PERMISSION) ||
    ADMIN_PERMISSION_SET.every((permission) => enabled.has(permission))
  );
}

function isWorkspaceHandleCandidate(value: string) {
  return /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/u.test(value);
}

async function normalizeWorkspaceIdForUser({
  admin,
  userId,
  wsId,
}: {
  admin: AdminDb;
  userId: string;
  wsId: string;
}) {
  const resolvedWorkspaceId = resolveWorkspaceId(wsId);

  if (resolvedWorkspaceId === ROOT_WORKSPACE_ID) {
    return ROOT_WORKSPACE_ID;
  }

  if (resolvedWorkspaceId.toLowerCase() === PERSONAL_WORKSPACE_SLUG) {
    const { data, error } = await admin
      .from('workspaces')
      .select('id, workspace_members!inner(user_id, type)')
      .eq('personal', true)
      .eq('workspace_members.user_id', userId)
      .eq('workspace_members.type', 'MEMBER')
      .maybeSingle();

    if (error || !data?.id) {
      throw new Error('Personal workspace not found');
    }

    return data.id;
  }

  if (validateUUID(resolvedWorkspaceId)) {
    return resolvedWorkspaceId;
  }

  const handle = resolvedWorkspaceId.trim().toLowerCase();

  if (!isWorkspaceHandleCandidate(handle)) {
    return resolvedWorkspaceId;
  }

  const { data } = await admin
    .from('workspaces')
    .select('id')
    .eq('handle', handle)
    .maybeSingle();

  return data?.id ?? resolvedWorkspaceId;
}

function accessError(message: string, status: 400 | 401 | 403 | 500) {
  return {
    ok: false as const,
    response: NextResponse.json({ error: message }, { status }),
  };
}

export async function requireExternalAppWorkspaceMembersAccess({
  capability = 'view',
  request,
  requiredScopes,
  wsId,
}: {
  capability?: Capability;
  request: Request;
  requiredScopes: RequiredScope[];
  wsId: string;
}) {
  const token = getBearerAppCoordinationToken(request);

  if (!token) {
    return accessError('Unauthorized', 401);
  }

  const verification = verifyAppCoordinationToken(token);

  if (!verification.ok) {
    return accessError('Unauthorized', 401);
  }

  for (const requiredScope of requiredScopes) {
    if (!hasScope(verification.claims.scopes, requiredScope)) {
      return accessError('Forbidden', 403);
    }
  }

  const admin = (await createAdminClient()) as TypedSupabaseClient;
  const app = await getExternalAppById(verification.claims.target_app, admin);

  if (!app?.enabled) {
    return accessError('Forbidden', 403);
  }

  let normalizedWorkspaceId: string;
  try {
    normalizedWorkspaceId = await normalizeWorkspaceIdForUser({
      admin,
      userId: verification.claims.sub,
      wsId,
    });
  } catch {
    return accessError('Forbidden', 403);
  }

  if (!app.allowedWorkspaceIds.includes(normalizedWorkspaceId.toLowerCase())) {
    return accessError('App is not linked to this workspace', 403);
  }

  const membership = await verifyWorkspaceMembershipType({
    requiredType: 'MEMBER',
    supabase: admin,
    userId: verification.claims.sub,
    wsId: normalizedWorkspaceId,
  });

  if (membership.error === 'membership_lookup_failed') {
    return accessError('Failed to verify workspace membership', 500);
  }

  if (!membership.ok) {
    return accessError('Forbidden', 403);
  }

  const permissions = await getPermissions({
    user: {
      email: verification.claims.email,
      id: verification.claims.sub,
    },
    wsId: normalizedWorkspaceId,
  });

  if (!permissions) {
    return accessError('Forbidden', 403);
  }

  const canManageMembers = permissions.containsPermission(
    'manage_workspace_members'
  );
  const canManageRoles = permissions.containsPermission(
    'manage_workspace_roles'
  );
  const allowed =
    capability === 'view' ||
    (capability === 'manage-members' && canManageMembers) ||
    (capability === 'manage-roles' && canManageMembers && canManageRoles);

  if (!allowed) {
    return accessError('Forbidden', 403);
  }

  return {
    admin,
    canManageMembers,
    canManageRoles,
    normalizedWorkspaceId,
    ok: true as const,
    permissions,
    targetApp: app.id,
    user: {
      email: verification.claims.email,
      id: verification.claims.sub,
    },
  };
}

function defaultAdminEnabled(member: EnhancedWorkspaceMember) {
  return hasAdminPermission(member.default_permissions ?? []);
}

function roleGrantsAdminPermission(
  role: NonNullable<EnhancedWorkspaceMember['roles']>[number]
) {
  const permissions = role.permissions ?? [];
  return permissions.some(
    (permission) =>
      permission.enabled !== false &&
      (permission.permission === BROAD_ADMIN_PERMISSION ||
        ADMIN_PERMISSION_LOOKUP.has(
          permission.permission as WorkspaceRolePermissionValue
        ))
  );
}

function roleAdminSources(member: EnhancedWorkspaceMember) {
  return (member.roles ?? [])
    .filter((role) => roleGrantsAdminPermission(role))
    .map((role) => role.id);
}

function roleAdminEnabled(member: EnhancedWorkspaceMember) {
  return hasAdminPermission(
    (member.roles ?? []).flatMap((role) => role.permissions ?? [])
  );
}

function normalizeWorkspaceMembers({
  currentUserId,
  members,
}: {
  currentUserId: string;
  members: EnhancedWorkspaceMember[];
}): WorkspaceMembersSnapshot {
  const defaultAdmin = members.some(
    (member) => !member.pending && defaultAdminEnabled(member)
  );
  const normalizedMembers: ExternalAppWorkspaceMember[] = [];
  const invitations: WorkspaceMembersSnapshot['invitations'] = [];

  for (const member of members) {
    if (member.pending) {
      if (member.email) {
        invitations.push({
          createdAt: member.created_at ?? null,
          email: member.email,
        });
      }
      continue;
    }

    if (!member.id) continue;

    const roleSources: ExternalAppWorkspaceMember['roleSources'] = [];
    const roleAdmin = roleAdminEnabled(member);

    if (member.is_creator) roleSources.push('creator');
    if (defaultAdminEnabled(member)) roleSources.push('default');
    if (roleAdmin) roleSources.push('role');

    normalizedMembers.push({
      avatarUrl: member.avatar_url ?? null,
      displayName: member.display_name ?? null,
      email: member.email ?? null,
      id: member.id,
      isCreator: member.is_creator,
      isCurrentUser: member.id === currentUserId,
      role:
        member.is_creator || defaultAdminEnabled(member) || roleAdmin
          ? 'admin'
          : 'member',
      roleSources,
    });
  }

  return {
    defaultAdminEnabled: defaultAdmin,
    invitations,
    members: normalizedMembers.sort((a, b) =>
      (a.email ?? a.displayName ?? a.id).localeCompare(
        b.email ?? b.displayName ?? b.id
      )
    ),
  };
}

export async function loadExternalAppWorkspaceMembers(
  access: ExternalAppWorkspaceMembersAccess
) {
  const members = await getWorkspaceMembers({
    sbAdmin: access.admin,
    status: 'all',
    supabase: access.admin,
    wsId: access.normalizedWorkspaceId,
  });
  const snapshot = normalizeWorkspaceMembers({
    currentUserId: access.user.id,
    members,
  });

  return {
    context: {
      canManageMembers: access.canManageMembers,
      canManageRoles: access.canManageRoles,
      defaultAdminEnabled: snapshot.defaultAdminEnabled,
    },
    invitations: snapshot.invitations,
    members: snapshot.members,
  };
}

export async function inviteExternalAppWorkspaceMembers({
  access,
  request,
}: {
  access: ExternalAppWorkspaceMembersAccess;
  request: Request;
}) {
  const validation = inviteSchema.safeParse(await request.json());

  if (!validation.success) {
    return NextResponse.json(
      { message: 'Invalid request body. Expected { emails: string[] }' },
      { status: 400 }
    );
  }

  const uniqueEmails = [
    ...new Set(validation.data.emails.map((email) => email.toLowerCase())),
  ];
  const { effectiveAvailable, status } = await getEffectiveAvailableSeats(
    access.admin,
    access.normalizedWorkspaceId
  );

  if (status.isSeatBased && effectiveAvailable < uniqueEmails.length) {
    return NextResponse.json(
      {
        availableSeats: effectiveAvailable,
        code: 'SEAT_LIMIT_REACHED',
        message: `Not enough seats to invite ${uniqueEmails.length} user(s). Available: ${effectiveAvailable}, Total seats: ${status.seatCount}.`,
        requestedCount: uniqueEmails.length,
      },
      { status: 403 }
    );
  }

  const results: Array<{ email: string; error?: string; success: boolean }> =
    [];

  for (const email of uniqueEmails) {
    const { error } = await access.admin
      .from('workspace_email_invites')
      .insert({
        email,
        invited_by: access.user.id,
        type: MEMBER_DEFAULT_TYPE,
        ws_id: access.normalizedWorkspaceId,
      });

    if (error) {
      const isDuplicate = error.message.includes('duplicate key value');
      const isSeatLimit =
        error.message.includes('workspace_has_available_seats') ||
        error.message.includes('seat');
      results.push({
        email,
        error: isDuplicate
          ? 'Already invited or member'
          : isSeatLimit
            ? 'Seat limit reached'
            : 'Failed to send invite',
        success: false,
      });
    } else {
      results.push({ email, success: true });
    }
  }

  const successCount = results.filter((result) => result.success).length;

  if (successCount > 0) {
    await access.admin.from('onboarding_progress').upsert(
      {
        invited_emails: results
          .filter((result) => result.success)
          .map((result) => result.email),
        user_id: access.user.id,
      },
      { onConflict: 'user_id' }
    );
  }

  return NextResponse.json({
    message: `${successCount} invite(s) sent successfully`,
    results,
    successCount,
    totalRequested: uniqueEmails.length,
  });
}

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
    .select('id')
    .eq('ws_id', access.normalizedWorkspaceId)
    .eq('name', ADMIN_ROLE_NAME)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existing?.id) {
    return existing.id;
  }

  const { data: role, error: roleError } = await access.admin
    .from('workspace_roles')
    .insert({
      name: ADMIN_ROLE_NAME,
      ws_id: access.normalizedWorkspaceId,
    } satisfies TablesInsert<'workspace_roles'>)
    .select('id')
    .single();

  if (roleError || !role?.id) {
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

export const externalAppWorkspaceMemberScopes = {
  membersRead: WORKSPACE_MEMBERS_READ_SCOPE,
  membersWrite: WORKSPACE_MEMBERS_WRITE_SCOPE,
  rolesRead: WORKSPACE_ROLES_READ_SCOPE,
  rolesWrite: WORKSPACE_ROLES_WRITE_SCOPE,
} as const;
