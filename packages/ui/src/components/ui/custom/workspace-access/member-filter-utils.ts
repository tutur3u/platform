import type { InternalApiEnhancedWorkspaceMember } from '@tuturuuu/types';
import type {
  MemberFiltersState,
  PermissionOption,
  WorkspaceAccessRole,
} from './types';

export type MemberFilterRoleOption = {
  count: number;
  id: string;
  name: string;
};

export type MemberFilterPermissionOption = PermissionOption & {
  count: number;
};

export function parseInviteEmails(value: string) {
  return [
    ...new Set(
      value
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean)
    ),
  ];
}

export function getEffectiveMemberPermissionIds(
  member: InternalApiEnhancedWorkspaceMember
) {
  const permissions = new Set<string>();

  for (const permission of member.default_permissions ?? []) {
    if (permission.enabled) permissions.add(permission.permission);
  }

  for (const role of member.roles ?? []) {
    for (const permission of role.permissions ?? []) {
      if (permission.enabled) permissions.add(permission.permission);
    }
  }

  return permissions;
}

export function getMemberDisplayName(
  member: InternalApiEnhancedWorkspaceMember,
  fallback: string
) {
  return member.display_name || member.email || member.handle || fallback;
}

export function getAvailableRolesForMember(
  member: InternalApiEnhancedWorkspaceMember,
  roles: Array<Pick<WorkspaceAccessRole, 'id' | 'name'>>
) {
  return roles.filter(
    (role) => !member.roles.some((assignedRole) => assignedRole.id === role.id)
  );
}

export function shouldShowProtectedMemberStatus({
  isCreator,
}: {
  isCreator: boolean;
}) {
  return isCreator;
}

export function sortMembers(
  members: InternalApiEnhancedWorkspaceMember[]
): InternalApiEnhancedWorkspaceMember[] {
  return [...members].sort((left, right) => {
    const leftPriority = left.is_creator ? 0 : left.pending ? 2 : 1;
    const rightPriority = right.is_creator ? 0 : right.pending ? 2 : 1;

    if (leftPriority !== rightPriority) return leftPriority - rightPriority;

    const leftCreatedAt = left.created_at
      ? new Date(left.created_at).getTime()
      : 0;
    const rightCreatedAt = right.created_at
      ? new Date(right.created_at).getTime()
      : 0;

    if (leftCreatedAt !== rightCreatedAt) return rightCreatedAt - leftCreatedAt;

    return getMemberDisplayName(left, '').localeCompare(
      getMemberDisplayName(right, '')
    );
  });
}

function memberMatchesText(
  member: InternalApiEnhancedWorkspaceMember,
  search: string
) {
  if (!search.trim()) return true;
  const query = search.toLowerCase();

  return [member.display_name, member.email, member.handle]
    .filter(Boolean)
    .some((value) => value?.toLowerCase().includes(query));
}

function memberMatchesRoleFilter(
  member: InternalApiEnhancedWorkspaceMember,
  roleIds: string[]
) {
  if (roleIds.length === 0) return true;
  const memberRoleIds = new Set((member.roles ?? []).map((role) => role.id));
  return roleIds.some((roleId) => memberRoleIds.has(roleId));
}

function memberMatchesPermissionFilter(
  member: InternalApiEnhancedWorkspaceMember,
  permissionIds: string[]
) {
  if (permissionIds.length === 0) return true;
  if (member.pending) return false;
  const effectivePermissionIds = getEffectiveMemberPermissionIds(member);

  if (member.is_creator || effectivePermissionIds.has('admin')) return true;

  return permissionIds.some((permissionId) =>
    effectivePermissionIds.has(permissionId)
  );
}

export function filterWorkspaceMembers(
  members: InternalApiEnhancedWorkspaceMember[],
  filters: MemberFiltersState & { search?: string; status?: string }
) {
  const roleIds = [...new Set(filters.roleIds.filter(Boolean))];
  const permissionIds = [...new Set(filters.permissionIds.filter(Boolean))];

  return members.filter((member) => {
    if (filters.status === 'joined' && member.pending) return false;
    if (filters.status === 'invited' && !member.pending) return false;

    return (
      memberMatchesText(member, filters.search ?? '') &&
      memberMatchesRoleFilter(member, roleIds) &&
      memberMatchesPermissionFilter(member, permissionIds)
    );
  });
}

export function getMemberFilterOptions(
  members: InternalApiEnhancedWorkspaceMember[],
  permissionDefinitions: PermissionOption[]
) {
  const roleOptions = new Map<string, MemberFilterRoleOption>();
  const permissionOptions = new Map<string, MemberFilterPermissionOption>();

  for (const definition of permissionDefinitions) {
    permissionOptions.set(definition.id, { ...definition, count: 0 });
  }

  for (const member of members) {
    const memberRoleIds = new Set<string>();
    const effectivePermissionIds = getEffectiveMemberPermissionIds(member);

    for (const role of member.roles ?? []) {
      if (memberRoleIds.has(role.id)) continue;

      const existingRole = roleOptions.get(role.id);
      roleOptions.set(role.id, {
        count: (existingRole?.count ?? 0) + 1,
        id: role.id,
        name: role.name,
      });
      memberRoleIds.add(role.id);
    }

    if (member.pending) continue;

    for (const permissionId of effectivePermissionIds) {
      const existingPermission = permissionOptions.get(permissionId);
      permissionOptions.set(permissionId, {
        count: (existingPermission?.count ?? 0) + 1,
        groupTitle: existingPermission?.groupTitle,
        id: permissionId,
        title: existingPermission?.title ?? permissionId,
      });
    }
  }

  return {
    permissions: [...permissionOptions.values()]
      .filter((permission) => permission.count > 0)
      .sort((a, b) => a.title.localeCompare(b.title)),
    roles: [...roleOptions.values()].sort((a, b) =>
      a.name.localeCompare(b.name)
    ),
  };
}
