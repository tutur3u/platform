import type { WorkspaceRoleDetails } from '@tuturuuu/internal-api';
import type { InternalApiEnhancedWorkspaceMember } from '@tuturuuu/types';

export type CmsMembersSectionProps = {
  workspaceSlug: string;
};

export type CmsMemberTab = 'all' | 'invited' | 'joined' | 'roles';

export type RoleEditorState =
  | { mode: 'create' }
  | { mode: 'default'; role: WorkspaceRoleDetails | null }
  | { mode: 'edit'; role: WorkspaceRoleDetails };

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

export function getAvailableRolesForMember(
  member: InternalApiEnhancedWorkspaceMember,
  roles: Array<Pick<WorkspaceRoleDetails, 'id' | 'name'>>
) {
  return roles.filter(
    (role) => !member.roles.some((assignedRole) => assignedRole.id === role.id)
  );
}

export function getAssignedMembersForRole(
  roleId: string,
  members: InternalApiEnhancedWorkspaceMember[]
) {
  return members.filter((member) =>
    member.roles.some((assignedRole) => assignedRole.id === roleId)
  );
}

export function sortMembers(
  members: InternalApiEnhancedWorkspaceMember[]
): InternalApiEnhancedWorkspaceMember[] {
  return [...members].sort((left, right) => {
    const leftPriority = getMemberSortPriority(left);
    const rightPriority = getMemberSortPriority(right);

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    const leftCreatedAt = left.created_at
      ? new Date(left.created_at).getTime()
      : 0;
    const rightCreatedAt = right.created_at
      ? new Date(right.created_at).getTime()
      : 0;

    if (leftCreatedAt !== rightCreatedAt) {
      return rightCreatedAt - leftCreatedAt;
    }

    return getMemberDisplayValue(left).localeCompare(
      getMemberDisplayValue(right)
    );
  });
}

export function getMemberAccessProfile(
  member: InternalApiEnhancedWorkspaceMember
) {
  const uniquePermissions = new Set<string>();

  for (const permission of member.default_permissions) {
    if (permission.enabled) {
      uniquePermissions.add(permission.permission);
    }
  }

  for (const role of member.roles) {
    for (const permission of role.permissions) {
      if (permission.enabled) {
        uniquePermissions.add(permission.permission);
      }
    }
  }

  return {
    hasDefaultAccess: member.default_permissions.some(
      (permission) => permission.enabled
    ),
    hasRoleAccess: member.roles.length > 0,
    roleCount: member.roles.length,
    uniquePermissionCount: uniquePermissions.size,
  };
}

function getMemberSortPriority(member: InternalApiEnhancedWorkspaceMember) {
  if (member.is_creator) {
    return 0;
  }

  if (!member.pending) {
    return 1;
  }

  return 2;
}

function getMemberDisplayValue(member: InternalApiEnhancedWorkspaceMember) {
  return (
    member.display_name ||
    member.email ||
    member.handle ||
    member.id ||
    ''
  ).toLowerCase();
}
