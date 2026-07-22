import {
  addWorkspaceExternalProjectRoleMembers,
  createWorkspaceExternalProjectRole,
  deleteWorkspaceExternalProjectRole,
  getWorkspaceExternalProjectDefaultRole,
  getWorkspaceExternalProjectMembersContext,
  inviteWorkspaceExternalProjectMembers,
  listWorkspaceExternalProjectMembers,
  listWorkspaceExternalProjectRoles,
  removeWorkspaceExternalProjectMember,
  removeWorkspaceExternalProjectRoleMember,
  updateWorkspaceExternalProjectDefaultRole,
  updateWorkspaceExternalProjectRole,
} from '@tuturuuu/internal-api/external-project-team';
import { addRoleMembers, removeRoleMember } from '@tuturuuu/internal-api/roles';
import {
  createWorkspaceRole,
  deleteWorkspaceRole,
  getWorkspaceDefaultPermissions,
  listWorkspaceRoles,
  updateWorkspaceDefaultPermissions,
  updateWorkspaceRole,
} from '@tuturuuu/internal-api/settings';
import {
  inviteWorkspaceMember,
  listEnhancedWorkspaceMembers,
  removeWorkspaceMember,
} from '@tuturuuu/internal-api/workspaces';
import type { WorkspaceRole } from '@tuturuuu/types';
import type {
  WorkspaceAccessAdapter,
  WorkspaceAccessInvitePayload,
  WorkspaceAccessRole,
  WorkspaceAccessRolePayload,
} from './types';

type RoleLike = {
  created_at?: null | string;
  id: string;
  members?: WorkspaceAccessRole['members'];
  name: string;
  permissions: Array<{ enabled: boolean; id: string }>;
  user_count?: number;
  ws_id?: string;
};

export function normalizeWorkspaceAccessRole(role: RoleLike) {
  return {
    created_at: role.created_at,
    id: role.id,
    members: role.members,
    name: role.name,
    permissions: (role.permissions ?? []).map((permission) => ({
      enabled: permission.enabled,
      id: permission.id,
    })),
    user_count: role.user_count,
    ws_id: role.ws_id,
  } satisfies WorkspaceAccessRole;
}

async function inviteStandardWorkspaceMembers(
  workspaceId: string,
  payload: WorkspaceAccessInvitePayload
) {
  const results = await Promise.allSettled(
    payload.emails.map((email) => {
      const invitePayload: Parameters<typeof inviteWorkspaceMember>[1] & {
        accessPreset?: 'guest' | 'member' | 'pos_operator';
        confirmDefaultAdminMigration?: boolean;
      } = {
        accessPreset: payload.accessPreset,
        confirmDefaultAdminMigration: payload.confirmDefaultAdminMigration,
        email,
        memberType: payload.memberType,
      };
      return inviteWorkspaceMember(workspaceId, invitePayload);
    })
  );
  const successCount = results.filter(
    (result) => result.status === 'fulfilled'
  ).length;
  const failed = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected'
  );

  if (successCount === 0 && failed) {
    throw failed.reason instanceof Error
      ? failed.reason
      : new Error('Invitation failed');
  }

  return {
    message: `${successCount} invite(s) sent successfully`,
    successCount,
  };
}

export function createStandardWorkspaceAccessAdapter(): WorkspaceAccessAdapter {
  return {
    addRoleMembers,
    createRole: (workspaceId, payload) =>
      createWorkspaceRole(workspaceId, payload as WorkspaceRole),
    deleteRole: deleteWorkspaceRole,
    getDefaultRole: async (workspaceId, memberType) =>
      normalizeWorkspaceAccessRole(
        await getWorkspaceDefaultPermissions(workspaceId, memberType)
      ),
    inviteMembers: inviteStandardWorkspaceMembers,
    listMembers: listEnhancedWorkspaceMembers,
    listRoles: async (workspaceId, query) => {
      const result = await listWorkspaceRoles(workspaceId, {
        page: query?.page ?? '1',
        pageSize: query?.pageSize ?? '100',
        q: query?.q,
      });

      return {
        count: result.count,
        data: result.data.map((role) => normalizeWorkspaceAccessRole(role)),
      };
    },
    removeMember: removeWorkspaceMember,
    removeRoleMember,
    updateDefaultRole: (workspaceId, memberType, payload) =>
      updateWorkspaceDefaultPermissions(workspaceId, memberType, {
        permissions: payload.permissions as WorkspaceRole['permissions'],
      }),
    updateRole: (workspaceId, roleId, payload) =>
      updateWorkspaceRole(workspaceId, roleId, payload as WorkspaceRole),
  };
}

export function createExternalProjectWorkspaceAccessAdapter(): WorkspaceAccessAdapter {
  return {
    addRoleMembers: addWorkspaceExternalProjectRoleMembers,
    createRole: createWorkspaceExternalProjectRole,
    deleteRole: deleteWorkspaceExternalProjectRole,
    getContext: getWorkspaceExternalProjectMembersContext,
    getDefaultRole: async (workspaceId, memberType) =>
      normalizeWorkspaceAccessRole(
        await getWorkspaceExternalProjectDefaultRole(workspaceId, memberType)
      ),
    inviteMembers: (workspaceId, payload) =>
      inviteWorkspaceExternalProjectMembers(workspaceId, payload.emails),
    listMembers: listWorkspaceExternalProjectMembers,
    listRoles: async (workspaceId, query) => {
      const roles = (await listWorkspaceExternalProjectRoles(workspaceId)).map(
        normalizeWorkspaceAccessRole
      );
      const normalizedQuery = query?.q?.trim().toLowerCase();
      const filtered = normalizedQuery
        ? roles.filter((role) =>
            role.name.toLowerCase().includes(normalizedQuery)
          )
        : roles;

      return {
        count: filtered.length,
        data: filtered,
      };
    },
    removeMember: removeWorkspaceExternalProjectMember,
    removeRoleMember: removeWorkspaceExternalProjectRoleMember,
    updateDefaultRole: (workspaceId, memberType, payload) =>
      updateWorkspaceExternalProjectDefaultRole(
        workspaceId,
        memberType,
        payload
      ),
    updateRole: updateWorkspaceExternalProjectRole,
  };
}

export type { WorkspaceAccessAdapter, WorkspaceAccessRolePayload };
