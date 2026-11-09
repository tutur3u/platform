import type { InternalApiEnhancedWorkspaceMember } from '@tuturuuu/types';

export type MemberFilterRoleOption = {
  id: string;
  name: string;
  count: number;
};

export type MemberFilterPermissionOption = {
  id: string;
  title: string;
  groupTitle?: string;
  count: number;
};

export type MemberFilterPermissionDefinition = {
  id: string;
  title: string;
  groupTitle?: string;
};

export type MemberFilterOptions = {
  roles: MemberFilterRoleOption[];
  permissions: MemberFilterPermissionOption[];
};

export function getEffectiveMemberPermissionIds(
  member: InternalApiEnhancedWorkspaceMember
) {
  const permissions = new Set<string>();

  for (const permission of member.default_permissions ?? []) {
    if (permission.enabled) {
      permissions.add(permission.permission);
    }
  }

  for (const role of member.roles ?? []) {
    for (const permission of role.permissions ?? []) {
      if (permission.enabled) {
        permissions.add(permission.permission);
      }
    }
  }

  return permissions;
}

function memberMatchesRoleFilter(
  member: InternalApiEnhancedWorkspaceMember,
  roleIds: string[]
) {
  if (roleIds.length === 0) {
    return true;
  }

  const memberRoleIds = new Set((member.roles ?? []).map((role) => role.id));
  return roleIds.some((roleId) => memberRoleIds.has(roleId));
}

function memberMatchesPermissionFilter(
  member: InternalApiEnhancedWorkspaceMember,
  permissionIds: string[]
) {
  if (permissionIds.length === 0) {
    return true;
  }

  if (member.pending) {
    return false;
  }

  const effectivePermissionIds = getEffectiveMemberPermissionIds(member);

  if (member.is_creator || effectivePermissionIds.has('admin')) {
    return true;
  }

  return permissionIds.some((permissionId) =>
    effectivePermissionIds.has(permissionId)
  );
}

export function filterWorkspaceMembers(
  members: InternalApiEnhancedWorkspaceMember[],
  filters: {
    roleIds: string[];
    permissionIds: string[];
  }
) {
  const roleIds = [...new Set(filters.roleIds.filter(Boolean))];
  const permissionIds = [...new Set(filters.permissionIds.filter(Boolean))];

  return members.filter(
    (member) =>
      memberMatchesRoleFilter(member, roleIds) &&
      memberMatchesPermissionFilter(member, permissionIds)
  );
}

export function getMemberFilterOptions(
  members: InternalApiEnhancedWorkspaceMember[],
  permissionDefinitions: MemberFilterPermissionDefinition[]
): MemberFilterOptions {
  const roleOptions = new Map<string, MemberFilterRoleOption>();
  const permissionOptions = new Map<string, MemberFilterPermissionOption>();

  for (const definition of permissionDefinitions) {
    permissionOptions.set(definition.id, {
      count: 0,
      groupTitle: definition.groupTitle,
      id: definition.id,
      title: definition.title,
    });
  }

  for (const member of members) {
    const memberRoleIds = new Set<string>();
    const effectivePermissionIds = getEffectiveMemberPermissionIds(member);

    for (const role of member.roles ?? []) {
      if (memberRoleIds.has(role.id)) {
        continue;
      }

      const existingRole = roleOptions.get(role.id);
      roleOptions.set(role.id, {
        count: (existingRole?.count ?? 0) + 1,
        id: role.id,
        name: role.name,
      });
      memberRoleIds.add(role.id);
    }

    if (member.pending) {
      continue;
    }

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
