import type { WorkspaceRoleDetails } from '@tuturuuu/internal-api';
import type { InternalApiEnhancedWorkspaceMember } from '@tuturuuu/types';

export type CmsMembersSectionProps = {
  boundProjectName?: string | null;
  canManageMembers: boolean;
  canManageRoles: boolean;
  currentUserEmail?: string | null;
  workspaceId: string;
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
