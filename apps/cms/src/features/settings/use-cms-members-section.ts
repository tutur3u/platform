'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addWorkspaceExternalProjectRoleMembers,
  deleteWorkspaceExternalProjectRole,
  getWorkspaceExternalProjectDefaultRole,
  getWorkspaceExternalProjectMembersContext,
  inviteWorkspaceExternalProjectMembers,
  listWorkspaceExternalProjectMembers,
  listWorkspaceExternalProjectRoles,
  removeWorkspaceExternalProjectMember,
  removeWorkspaceExternalProjectRoleMember,
  type WorkspaceRoleDetails,
} from '@tuturuuu/internal-api';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import {
  permissionGroups,
  totalPermissions,
} from '@tuturuuu/utils/permissions';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  type CmsMemberTab,
  getMemberAccessProfile,
  getMemberPermissionIds,
  parseInviteEmails,
  type RoleEditorState,
  sortMembers,
} from './cms-members-shared';

export function useCmsMembersSection({
  workspaceSlug,
}: {
  workspaceSlug: string;
}) {
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [inviteEmails, setInviteEmails] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [roleSearch, setRoleSearch] = useState('');
  const [activeTab, setActiveTab] = useState<CmsMemberTab>('all');
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<
    Set<string>
  >(new Set());
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(
    new Set()
  );
  const [roleEditorState, setRoleEditorState] =
    useState<RoleEditorState | null>(null);
  const [roleToDelete, setRoleToDelete] = useState<WorkspaceRoleDetails | null>(
    null
  );

  const contextQuery = useQuery({
    queryFn: () => getWorkspaceExternalProjectMembersContext(workspaceSlug),
    queryKey: ['cms-members-context', workspaceSlug],
    staleTime: 30_000,
  });

  const workspaceId = contextQuery.data?.workspaceId;
  const canManageMembers = contextQuery.data?.canManageMembers ?? false;
  const canManageRoles = contextQuery.data?.canManageRoles ?? false;
  const currentUserEmail = contextQuery.data?.currentUserEmail ?? null;

  const permissionUser = currentUserEmail
    ? ({ email: currentUserEmail } as SupabaseUser)
    : null;
  const permissionCatalog = permissionGroups({
    t: t as (key: string) => string,
    user: permissionUser,
    wsId: workspaceId ?? workspaceSlug,
  });
  const permissionTitles = new Map<string, string>(
    permissionCatalog.flatMap((group) =>
      group.permissions.map((permission) => [permission.id, permission.title])
    )
  );
  const permissionCount = totalPermissions({
    user: permissionUser,
    wsId: workspaceId ?? workspaceSlug,
  });

  const parsedInviteEmails = parseInviteEmails(inviteEmails);

  const membersQuery = useQuery({
    enabled: Boolean(workspaceId),
    queryFn: () => listWorkspaceExternalProjectMembers(workspaceId!, 'all'),
    queryKey: ['cms-members', workspaceId],
    staleTime: 30_000,
  });
  const rolesQuery = useQuery({
    enabled: Boolean(workspaceId),
    queryFn: () => listWorkspaceExternalProjectRoles(workspaceId!),
    queryKey: ['cms-member-roles', workspaceId],
    staleTime: 30_000,
  });
  const memberDefaultRoleQuery = useQuery({
    enabled: Boolean(workspaceId),
    queryFn: () =>
      getWorkspaceExternalProjectDefaultRole(workspaceId!, 'MEMBER'),
    queryKey: ['cms-default-role', workspaceId, 'MEMBER'],
    staleTime: 30_000,
  });
  const guestDefaultRoleQuery = useQuery({
    enabled: Boolean(workspaceId),
    queryFn: () =>
      getWorkspaceExternalProjectDefaultRole(workspaceId!, 'GUEST'),
    queryKey: ['cms-default-role', workspaceId, 'GUEST'],
    staleTime: 30_000,
  });

  const invalidateAccessData = () => {
    queryClient.invalidateQueries({ queryKey: ['cms-members', workspaceId] });
    queryClient.invalidateQueries({
      queryKey: ['cms-member-roles', workspaceId],
    });
    queryClient.invalidateQueries({
      queryKey: ['cms-default-role', workspaceId],
    });
  };

  const inviteMutation = useMutation({
    mutationFn: async () =>
      inviteWorkspaceExternalProjectMembers(
        workspaceId!,
        parseInviteEmails(inviteEmails)
      ),
    onError: (error) =>
      toastError(t, error instanceof Error ? error.message : t('common.error')),
    onSuccess: (result) => {
      setInviteEmails('');
      toastSuccess(result.message);
      queryClient.invalidateQueries({ queryKey: ['cms-members', workspaceId] });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (payload: {
      email?: string | null;
      userId?: string | null;
    }) => removeWorkspaceExternalProjectMember(workspaceId!, payload),
    onError: (error) =>
      toastError(t, error instanceof Error ? error.message : t('common.error')),
    onSuccess: () => {
      toastSuccess(t('common.deleted'));
      queryClient.invalidateQueries({ queryKey: ['cms-members', workspaceId] });
    },
  });

  const roleMembershipMutation = useMutation({
    mutationFn: async (payload: {
      action: 'add' | 'remove';
      roleId: string;
      userId: string;
    }) => {
      if (payload.action === 'add') {
        return addWorkspaceExternalProjectRoleMembers(
          workspaceId!,
          payload.roleId,
          [payload.userId]
        );
      }

      return removeWorkspaceExternalProjectRoleMember(
        workspaceId!,
        payload.roleId,
        payload.userId
      );
    },
    onError: (error) =>
      toastError(t, error instanceof Error ? error.message : t('common.error')),
    onSuccess: () => {
      toastSuccess(t('common.saved'));
      invalidateAccessData();
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (roleId: string) =>
      deleteWorkspaceExternalProjectRole(workspaceId!, roleId),
    onError: (error) =>
      toastError(t, error instanceof Error ? error.message : t('common.error')),
    onSuccess: () => {
      toastSuccess(t('common.deleted'));
      setRoleToDelete(null);
      invalidateAccessData();
    },
  });

  const sortedMembers = sortMembers(membersQuery.data ?? []);

  const visibleMembers = sortedMembers.filter((member) => {
    if (activeTab === 'joined' && member.pending) {
      return false;
    }

    if (activeTab === 'invited' && !member.pending) {
      return false;
    }

    if (memberSearch.trim()) {
      const query = memberSearch.toLowerCase();
      const matchesSearch = [member.display_name, member.email, member.handle]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(query));

      if (!matchesSearch) {
        return false;
      }
    }

    if (
      selectedRoleIds.size > 0 &&
      !member.roles.some((role) => selectedRoleIds.has(role.id))
    ) {
      return false;
    }

    if (selectedPermissionIds.size > 0) {
      const memberPermissionIds = getMemberPermissionIds(member);

      for (const permissionId of selectedPermissionIds) {
        if (!memberPermissionIds.has(permissionId)) {
          return false;
        }
      }
    }

    return true;
  });

  const joinedMembers = sortedMembers.filter((member) => !member.pending);
  const roleAssignableMembers = joinedMembers.filter(
    (member) => !member.is_creator
  );
  const invitedMembers = sortedMembers.filter((member) => member.pending);
  const guests = joinedMembers.filter(
    (member) => member.workspace_member_type === 'GUEST'
  );
  const joinedMembersWithRoles = roleAssignableMembers.filter(
    (member) => getMemberAccessProfile(member).hasRoleAccess
  );
  const membersNeedingRoles = roleAssignableMembers.filter(
    (member) => !getMemberAccessProfile(member).hasRoleAccess
  );
  const totalUniquePermissions = joinedMembers.reduce((total, member) => {
    return total + getMemberAccessProfile(member).uniquePermissionCount;
  }, 0);

  const filteredRoles = (rolesQuery.data ?? []).filter((role) => {
    if (!roleSearch.trim()) {
      return true;
    }

    const query = roleSearch.toLowerCase();
    const memberNames = (membersQuery.data ?? [])
      .filter((member) =>
        member.roles.some((assignedRole) => assignedRole.id === role.id)
      )
      .map(
        (member) => member.display_name || member.email || member.handle || ''
      );

    return [role.name, ...memberNames]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(query));
  });

  return {
    activeTab,
    boundProjectName: contextQuery.data?.boundProjectName ?? null,
    canManageMembers,
    canManageRoles,
    contextQuery,
    currentUserEmail,
    deleteRoleMutation,
    filteredRoles,
    guestDefaultRoleQuery,
    guestsCount: guests.length,
    hasMemberSearch: memberSearch.trim().length > 0,
    inviteEmails,
    inviteEmailCount: parsedInviteEmails.length,
    inviteMutation,
    invalidateAccessData,
    invitedCount: invitedMembers.length,
    joinedCount: joinedMembers.length,
    memberSearch,
    memberDefaultRoleQuery,
    membersNeedingRolesCount: membersNeedingRoles.length,
    membersQuery,
    membersWithRolesCount: joinedMembersWithRoles.length,
    permissionCount,
    permissionTitles,
    removeMemberMutation,
    roleEditorState,
    roleSearch,
    roleCount: rolesQuery.data?.length ?? 0,
    rolesQuery,
    roleToDelete,
    roleMembershipMutation,
    selectedPermissionIds,
    selectedRoleIds,
    setActiveTab,
    setInviteEmails,
    setMemberSearch,
    setSelectedPermissionIds,
    setSelectedRoleIds,
    setRoleEditorState,
    setRoleSearch,
    setRoleToDelete,
    roleAssignableMembersCount: roleAssignableMembers.length,
    tabCounts: {
      all: sortedMembers.length,
      invited: invitedMembers.length,
      joined: joinedMembers.length,
      roles: rolesQuery.data?.length ?? 0,
    },
    totalUniquePermissions,
    visibleMembers,
    workspaceId,
  };
}

function toastError(_t: (key: string) => string, message: string) {
  import('@tuturuuu/ui/sonner').then(({ toast }) => toast.error(message));
}

function toastSuccess(message: string) {
  import('@tuturuuu/ui/sonner').then(({ toast }) => toast.success(message));
}
