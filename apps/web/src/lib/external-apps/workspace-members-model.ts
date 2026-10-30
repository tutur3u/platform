import type { EnhancedWorkspaceMember } from '@/lib/workspace-members';
import {
  ADMIN_PERMISSION_LOOKUP,
  ADMIN_PERMISSION_SET,
  BROAD_ADMIN_PERMISSION,
  type WorkspaceRolePermissionValue,
} from './workspace-members-constants';

export type ExternalAppWorkspaceMember = {
  avatarUrl: string | null;
  displayName: string | null;
  email: string | null;
  id: string;
  isCreator: boolean;
  isCurrentUser: boolean;
  role: 'admin' | 'member';
  roleSources: Array<'admin' | 'creator' | 'default' | 'role'>;
};

export type WorkspaceMembersSnapshot = {
  defaultAdminEnabled: boolean;
  invitations: Array<{ createdAt: string | null; email: string }>;
  members: ExternalAppWorkspaceMember[];
};

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

export function defaultAdminEnabled(member: EnhancedWorkspaceMember) {
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

export function roleAdminSources(member: EnhancedWorkspaceMember) {
  return (member.roles ?? [])
    .filter((role) => roleGrantsAdminPermission(role))
    .map((role) => role.id);
}

function roleAdminEnabled(member: EnhancedWorkspaceMember) {
  return hasAdminPermission(
    (member.roles ?? []).flatMap((role) => role.permissions ?? [])
  );
}

export function normalizeWorkspaceMembers({
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
