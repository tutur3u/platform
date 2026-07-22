import type {
  InternalApiEnhancedWorkspaceMember,
  PermissionId,
  WorkspaceDefaultPermissionMemberType,
} from '@tuturuuu/types';

export type WorkspaceAccessMode = 'cms' | 'workspace';

export type WorkspaceAccessTab =
  | 'defaults-guest'
  | 'defaults-member'
  | 'people'
  | 'roles';

export type WorkspaceAccessMemberStatus = 'all' | 'invited' | 'joined';

export type WorkspaceAccessContext = {
  boundProjectName?: null | string;
  canManageMembers: boolean;
  canManageRoles: boolean;
  currentUserEmail?: null | string;
  workspaceId: string;
};

export type WorkspaceAccessRolePermission = {
  enabled: boolean;
  id: string;
};

export type WorkspaceAccessRoleMember = {
  avatar_url?: null | string;
  display_name?: null | string;
  email?: null | string;
  full_name?: null | string;
  id: string;
};

export type WorkspaceAccessRole = {
  created_at?: null | string;
  id: string;
  member_type?: WorkspaceDefaultPermissionMemberType;
  members?: WorkspaceAccessRoleMember[];
  name: string;
  permissions: WorkspaceAccessRolePermission[];
  user_count?: number;
  ws_id?: string;
};

export type WorkspaceAccessRolePayload = {
  name: string;
  permissions: WorkspaceAccessRolePermission[];
};

export type WorkspaceAccessInvitePayload = {
  accessPreset: 'guest' | 'member' | 'pos_operator';
  confirmDefaultAdminMigration?: boolean;
  emails: string[];
  memberType: WorkspaceDefaultPermissionMemberType;
};

export type WorkspaceAccessAdapter = {
  addRoleMembers: (
    workspaceId: string,
    roleId: string,
    memberIds: string[]
  ) => Promise<unknown>;
  createRole: (
    workspaceId: string,
    payload: WorkspaceAccessRolePayload
  ) => Promise<unknown>;
  deleteRole: (workspaceId: string, roleId: string) => Promise<unknown>;
  getContext?: (workspaceId: string) => Promise<WorkspaceAccessContext>;
  getDefaultRole: (
    workspaceId: string,
    memberType: WorkspaceDefaultPermissionMemberType
  ) => Promise<WorkspaceAccessRole>;
  inviteMembers: (
    workspaceId: string,
    payload: WorkspaceAccessInvitePayload
  ) => Promise<{ message?: string; successCount?: number }>;
  listMembers: (
    workspaceId: string,
    status?: WorkspaceAccessMemberStatus
  ) => Promise<InternalApiEnhancedWorkspaceMember[]>;
  listRoles: (
    workspaceId: string,
    query?: { page?: string; pageSize?: string; q?: string }
  ) => Promise<{ count: number; data: WorkspaceAccessRole[] }>;
  removeMember: (
    workspaceId: string,
    payload: { email?: null | string; userId?: null | string }
  ) => Promise<unknown>;
  removeRoleMember: (
    workspaceId: string,
    roleId: string,
    userId: string
  ) => Promise<unknown>;
  updateDefaultRole: (
    workspaceId: string,
    memberType: WorkspaceDefaultPermissionMemberType,
    payload: WorkspaceAccessRolePayload
  ) => Promise<unknown>;
  updateRole: (
    workspaceId: string,
    roleId: string,
    payload: WorkspaceAccessRolePayload
  ) => Promise<unknown>;
};

export type WorkspaceAccessPageProps = {
  adapter: WorkspaceAccessAdapter;
  disableInvite?: boolean;
  initialContext: WorkspaceAccessContext;
  initialTab?: WorkspaceAccessTab;
  mode?: WorkspaceAccessMode;
};

export type WorkspaceAccessRoleEditorState =
  | { mode: 'create' }
  | {
      memberType: WorkspaceDefaultPermissionMemberType;
      mode: 'default';
      role: WorkspaceAccessRole | null;
    }
  | { mode: 'edit'; role: WorkspaceAccessRole };

export type PermissionOption = {
  groupTitle?: string;
  id: string;
  title: string;
};

export type WorkspaceAccessLabels = {
  accessLevelsLabel: string;
  assignRolePlaceholder: string;
  clearFiltersAction: string;
  filterByPermission: string;
  filterByRole: string;
  noAdditionalRoles: string;
  noRolesLabel: string;
  protectedMemberLabel: string;
  removeMemberAction: string;
  rolesEmptyDescription: string;
  rolesEmptyTitle: string;
};

export type MemberFiltersState = {
  permissionIds: string[];
  roleIds: string[];
};

export type RoleFormPermissionValue = Record<PermissionId, boolean>;
