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
  listWorkspaceRoleOptions,
  listWorkspaceRoles,
  updateWorkspaceDefaultPermissions,
  updateWorkspaceRole,
} from '@tuturuuu/internal-api/settings';
import type { WorkspaceInvitationRoleAssignment } from '@tuturuuu/internal-api/workspaces';
import {
  inviteWorkspaceMember,
  listEnhancedWorkspaceMembers,
  listWorkspaceInvitationRoles,
  removeWorkspaceMember,
  updateWorkspaceInvitationRole,
  updateWorkspaceMemberProfile,
} from '@tuturuuu/internal-api/workspaces';
import type {
  InternalApiEnhancedWorkspaceMember,
  WorkspaceRole,
} from '@tuturuuu/types';
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

export function mergeWorkspaceInvitationRoles(
  members: InternalApiEnhancedWorkspaceMember[],
  invitations: WorkspaceInvitationRoleAssignment[]
) {
  const byUserId = new Map(
    invitations
      .filter((invitation) => invitation.userId)
      .map((invitation) => [invitation.userId, invitation])
  );
  const byEmail = new Map(
    invitations
      .filter((invitation) => invitation.email)
      .map((invitation) => [invitation.email?.trim().toLowerCase(), invitation])
  );

  return members.map((member) => {
    if (!member.pending) return member;

    const invitation =
      (member.id ? byUserId.get(member.id) : undefined) ??
      (member.email
        ? byEmail.get(member.email.trim().toLowerCase())
        : undefined);

    return {
      ...member,
      roles: (invitation?.roles ?? []).map((role) => ({
        ...role,
        permissions: [],
      })),
    };
  });
}

async function listStandardWorkspaceMembers(
  workspaceId: string,
  status?: 'all' | 'invited' | 'joined'
) {
  const [members, invitations] = await Promise.all([
    listEnhancedWorkspaceMembers(workspaceId, status),
    status === 'joined'
      ? Promise.resolve([])
      : listWorkspaceInvitationRoles(workspaceId),
  ]);

  return mergeWorkspaceInvitationRoles(members, invitations);
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
        roleIds: payload.roleIds,
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
    hardenDefaultAdmin: async (
      workspaceId,
      { memberIds, permissions, roleId, roleName }
    ) => {
      const role = roleId
        ? { id: roleId, message: 'existing' }
        : await createWorkspaceRole(workspaceId, {
            name: roleName,
            permissions,
          } as WorkspaceRole);

      if (memberIds.length > 0) {
        await addRoleMembers(workspaceId, role.id, memberIds);
      }

      await updateWorkspaceDefaultPermissions(workspaceId, 'MEMBER', {
        permissions: permissions.map((permission) => ({
          ...permission,
          enabled: false,
        })) as WorkspaceRole['permissions'],
      });

      return role;
    },
    inviteMembers: inviteStandardWorkspaceMembers,
    listMembers: listStandardWorkspaceMembers,
    listRoleOptions: listWorkspaceRoleOptions,
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
    updateMemberProfile: updateWorkspaceMemberProfile,
    updateInvitationRole: updateWorkspaceInvitationRole,
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
    listRoleOptions: async (workspaceId) => {
      const roles = await listWorkspaceExternalProjectRoles(workspaceId);
      return {
        count: roles.length,
        data: roles.map(({ id, name }) => ({ id, name })),
      };
    },
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
