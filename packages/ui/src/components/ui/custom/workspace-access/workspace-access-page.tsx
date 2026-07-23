'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TriangleAlert } from '@tuturuuu/icons';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { InternalApiEnhancedWorkspaceMember } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { toast } from '@tuturuuu/ui/sonner';
import { Tabs, TabsContent } from '@tuturuuu/ui/tabs';
import {
  permissionGroups,
  totalPermissions,
} from '@tuturuuu/utils/permissions';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  filterWorkspaceMembers,
  getMemberFilterOptions,
  parseInviteEmails,
  sortMembers,
} from './member-filter-utils';
import type {
  MemberFiltersState,
  PermissionOption,
  WorkspaceAccessMemberStatus,
  WorkspaceAccessPageProps,
  WorkspaceAccessRole,
  WorkspaceAccessRoleEditorState,
  WorkspaceAccessTab,
} from './types';
import { WorkspaceAccessDefaultRoleCard } from './workspace-access-default-role-card';
import { WorkspaceAccessInviteDialog } from './workspace-access-invite-dialog';
import { getWorkspaceAccessLabels } from './workspace-access-labels';
import { WorkspaceAccessMemberProfileDialog } from './workspace-access-member-profile-dialog';
import { WorkspaceAccessMembers } from './workspace-access-members';
import { WorkspaceAccessPageHeader } from './workspace-access-page-header';
import { WorkspaceAccessPeopleFilters } from './workspace-access-people-filters';
import { WorkspaceAccessRoleEditorDialog } from './workspace-access-role-editor-dialog';
import { WorkspaceAccessRoles } from './workspace-access-roles';
import { WorkspaceAccessTabsToolbar } from './workspace-access-tabs-toolbar';

export function WorkspaceAccessPage({
  adapter,
  disableInvite = false,
  initialContext,
  initialTab = 'people',
  mode = 'workspace',
  showHeader = true,
}: WorkspaceAccessPageProps) {
  const t = useTranslations() as (key: string) => string;
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<WorkspaceAccessTab>(initialTab);
  const [status, setStatus] = useState<WorkspaceAccessMemberStatus>('all');
  const [search, setSearch] = useState('');
  const [inviteEmails, setInviteEmails] = useState('');
  const [inviteAccessPreset, setInviteAccessPreset] = useState<
    'guest' | 'member' | 'pos_operator'
  >('member');
  const [confirmDefaultAdminMigration, setConfirmDefaultAdminMigration] =
    useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [filters, setFilters] = useState<MemberFiltersState>({
    permissionIds: [],
    roleIds: [],
  });
  const [roleEditorState, setRoleEditorState] =
    useState<WorkspaceAccessRoleEditorState | null>(null);
  const [profileMember, setProfileMember] =
    useState<InternalApiEnhancedWorkspaceMember | null>(null);

  const contextQuery = useQuery({
    enabled: Boolean(adapter.getContext),
    initialData: initialContext,
    queryFn: async () =>
      adapter.getContext
        ? adapter.getContext(initialContext.workspaceId)
        : initialContext,
    queryKey: ['workspace-access', initialContext.workspaceId, 'context'],
    staleTime: 30_000,
  });
  const context = contextQuery.data ?? initialContext;
  const workspaceId = context.workspaceId;
  const canManageMembers = context.canManageMembers;
  const canManageRoles = context.canManageRoles;
  const canInvite = canManageMembers && !disableInvite;
  const permissionUser = useMemo(
    () =>
      context.currentUserEmail
        ? ({ email: context.currentUserEmail } as SupabaseUser)
        : null,
    [context.currentUserEmail]
  );
  const labels = useMemo(() => getWorkspaceAccessLabels(mode, t), [mode, t]);

  const permissionDefinitions = useMemo<PermissionOption[]>(() => {
    const groups = permissionGroups({
      t: t as (key: string) => string,
      user: permissionUser,
      wsId: workspaceId,
    });

    return groups.flatMap((group) =>
      group.permissions.map((permission) => ({
        groupTitle: group.title,
        id: permission.id,
        title: permission.title,
      }))
    );
  }, [permissionUser, t, workspaceId]);

  const permissionTitles = useMemo(
    () =>
      new Map(
        permissionDefinitions.map((permission) => [
          permission.id,
          permission.title,
        ])
      ),
    [permissionDefinitions]
  );
  const permissionCount = totalPermissions({
    user: permissionUser,
    wsId: workspaceId,
  });

  const membersQuery = useQuery({
    queryFn: () => adapter.listMembers(workspaceId, 'all'),
    queryKey: ['workspace-access', workspaceId, 'members'],
    staleTime: 30_000,
  });
  const rolesQuery = useQuery({
    enabled: canManageRoles || mode === 'cms',
    queryFn: () =>
      adapter.listRoles(workspaceId, { pageSize: '100', q: search }),
    queryKey: ['workspace-access', workspaceId, 'roles', search],
    staleTime: 30_000,
  });
  const memberDefaultQuery = useQuery({
    enabled: canManageRoles,
    queryFn: () => adapter.getDefaultRole(workspaceId, 'MEMBER'),
    queryKey: ['workspace-access', workspaceId, 'defaults', 'MEMBER'],
    staleTime: 30_000,
  });
  const guestDefaultQuery = useQuery({
    enabled: canManageRoles,
    queryFn: () => adapter.getDefaultRole(workspaceId, 'GUEST'),
    queryKey: ['workspace-access', workspaceId, 'defaults', 'GUEST'],
    staleTime: 30_000,
  });

  const invalidateAccessData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['workspace-access', workspaceId, 'members'],
      }),
      queryClient.invalidateQueries({
        queryKey: ['workspace-access', workspaceId, 'roles'],
      }),
      queryClient.invalidateQueries({
        queryKey: ['workspace-access', workspaceId, 'defaults'],
      }),
    ]);
  };

  const inviteMutation = useMutation({
    mutationFn: () =>
      adapter.inviteMembers(workspaceId, {
        accessPreset: inviteAccessPreset,
        confirmDefaultAdminMigration,
        emails: parseInviteEmails(inviteEmails),
        memberType: inviteAccessPreset === 'guest' ? 'GUEST' : 'MEMBER',
      }),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('common.error')),
    onSuccess: async (result) => {
      setInviteEmails('');
      setInviteAccessPreset('member');
      setConfirmDefaultAdminMigration(false);
      setInviteDialogOpen(false);
      toast.success(result.message ?? t('ws-members.invitation-sent'));
      await invalidateAccessData();
    },
  });
  const removeMemberMutation = useMutation({
    mutationFn: (payload: { email?: null | string; userId?: null | string }) =>
      adapter.removeMember(workspaceId, payload),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('common.error')),
    onSuccess: async () => {
      toast.success(t('common.deleted'));
      await invalidateAccessData();
    },
  });
  const updateMemberProfileMutation = useMutation({
    mutationFn: ({
      displayName,
      member,
    }: {
      displayName: null | string;
      member: InternalApiEnhancedWorkspaceMember;
    }) => {
      if (!adapter.updateMemberProfile) {
        throw new Error(t('common.error'));
      }

      return adapter.updateMemberProfile(workspaceId, {
        displayName,
        email: member.id ? null : member.email,
        userId: member.id,
      });
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : t('ws-members.profile_display_name_update_error')
      ),
    onSuccess: async () => {
      setProfileMember(null);
      toast.success(t('ws-members.profile_display_name_updated'));
      await invalidateAccessData();
    },
  });
  const roleMembershipMutation = useMutation({
    mutationFn: (payload: {
      action: 'add' | 'remove';
      roleId: string;
      userId: string;
    }) =>
      payload.action === 'add'
        ? adapter.addRoleMembers(workspaceId, payload.roleId, [payload.userId])
        : adapter.removeRoleMember(workspaceId, payload.roleId, payload.userId),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('common.error')),
    onSuccess: async () => {
      toast.success(t('common.saved'));
      await invalidateAccessData();
    },
  });
  const deleteRoleMutation = useMutation({
    mutationFn: (roleId: string) => adapter.deleteRole(workspaceId, roleId),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('common.error')),
    onSuccess: async () => {
      toast.success(t('common.deleted'));
      await invalidateAccessData();
    },
  });
  const hardenDefaultAdminMutation = useMutation({
    mutationFn: async () => {
      if (!adapter.hardenDefaultAdmin) {
        throw new Error(t('common.error'));
      }

      const existingAdminRole = (rolesQuery.data?.data ?? []).find((role) =>
        role.permissions.some(
          (permission) => permission.id === 'admin' && permission.enabled
        )
      );
      const alreadyAssigned = new Set(
        existingAdminRole?.members?.map((member) => member.id) ?? []
      );
      const memberIds = (membersQuery.data ?? [])
        .filter(
          (member) =>
            !member.pending &&
            member.id &&
            member.workspace_member_type !== 'GUEST' &&
            !alreadyAssigned.has(member.id)
        )
        .map((member) => member.id as string);

      return adapter.hardenDefaultAdmin(workspaceId, {
        memberIds,
        permissions: [{ enabled: true, id: 'admin' }],
        roleId: existingAdminRole?.id,
        roleName: t('ws-roles.admin'),
      });
    },
    onError: async (error) => {
      toast.error(error instanceof Error ? error.message : t('common.error'));
      await invalidateAccessData();
    },
    onSuccess: async () => {
      toast.success(t('common.saved'));
      await invalidateAccessData();
    },
  });

  const roles = rolesQuery.data?.data ?? [];
  const sortedMembers = sortMembers(membersQuery.data ?? []);
  const visibleMembers = filterWorkspaceMembers(sortedMembers, {
    ...filters,
    search,
    status,
  });
  const joinedCount = sortedMembers.filter((member) => !member.pending).length;
  const invitedCount = sortedMembers.filter((member) => member.pending).length;
  const defaultAdminEnabled = Boolean(
    memberDefaultQuery.data?.permissions.some(
      (permission) => permission.id === 'admin' && permission.enabled
    )
  );
  const filterOptions = getMemberFilterOptions(
    sortedMembers,
    permissionDefinitions
  );

  if (contextQuery.isPending) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-10 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {showHeader ? (
        <WorkspaceAccessPageHeader
          context={context}
          invitedCount={invitedCount}
          joinedCount={joinedCount}
          mode={mode}
          totalCount={sortedMembers.length}
        />
      ) : null}

      {mode === 'workspace' &&
      canManageRoles &&
      defaultAdminEnabled &&
      adapter.hardenDefaultAdmin ? (
        <div className="flex flex-col gap-3 rounded-xl border border-dynamic-orange/25 bg-dynamic-orange/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-dynamic-orange" />
            <div>
              <div className="font-medium text-sm">
                {t('ws-roles.admin_enabled_title')}
              </div>
              <p className="mt-1 text-muted-foreground text-sm">
                {t('ws-members.pos_operator_admin_migration_note')}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            className="shrink-0"
            disabled={hardenDefaultAdminMutation.isPending}
            onClick={() => hardenDefaultAdminMutation.mutate()}
          >
            {t('ws-roles.create')}: {t('ws-roles.admin')}
          </Button>
        </div>
      ) : null}

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as WorkspaceAccessTab)}
      >
        <WorkspaceAccessTabsToolbar
          activeTab={activeTab}
          accessLevelsLabel={labels.accessLevelsLabel}
          canInvite={canInvite}
          canManageRoles={canManageRoles}
          disableInvite={disableInvite}
          onInviteClick={() => setInviteDialogOpen(true)}
          onSearchChange={setSearch}
          search={search}
        />

        <TabsContent value="people" className="mt-4 space-y-3 sm:mt-6">
          <WorkspaceAccessPeopleFilters
            filterOptions={filterOptions}
            filters={filters}
            labels={labels}
            onFiltersChange={setFilters}
            onStatusChange={setStatus}
            status={status}
          />

          <WorkspaceAccessMembers
            canEditProfiles={Boolean(adapter.updateMemberProfile)}
            canManageMembers={canManageMembers}
            canManageRoles={canManageRoles}
            defaultAdminEnabled={defaultAdminEnabled}
            isLoading={membersQuery.isPending}
            isMutating={
              removeMemberMutation.isPending ||
              roleMembershipMutation.isPending ||
              updateMemberProfileMutation.isPending
            }
            labels={labels}
            members={visibleMembers}
            onAssignRole={(payload) =>
              roleMembershipMutation.mutate({ ...payload, action: 'add' })
            }
            onEditMemberProfile={setProfileMember}
            onRemoveMember={(payload) => removeMemberMutation.mutate(payload)}
            onRemoveRole={(payload) =>
              roleMembershipMutation.mutate({ ...payload, action: 'remove' })
            }
            roles={roles}
            searchTerm={search}
            status={status}
          />
        </TabsContent>

        <TabsContent value="roles" className="mt-4 sm:mt-6">
          <WorkspaceAccessRoles
            canManageRoles={canManageRoles}
            isLoading={rolesQuery.isPending}
            labels={labels}
            members={sortedMembers}
            onCreateRole={() => setRoleEditorState({ mode: 'create' })}
            onDeleteRole={(role: WorkspaceAccessRole) =>
              deleteRoleMutation.mutate(role.id)
            }
            onEditRole={(role: WorkspaceAccessRole) =>
              setRoleEditorState({ mode: 'edit', role })
            }
            permissionCount={permissionCount}
            permissionTitles={permissionTitles}
            roles={roles}
          />
        </TabsContent>

        <TabsContent value="defaults-member" className="mt-4 sm:mt-6">
          <WorkspaceAccessDefaultRoleCard
            canManageRoles={canManageRoles}
            isLoading={memberDefaultQuery.isPending}
            memberType="MEMBER"
            onEdit={(memberType) =>
              setRoleEditorState({
                memberType,
                mode: 'default',
                role: memberDefaultQuery.data ?? null,
              })
            }
            permissionCount={permissionCount}
            permissionTitles={permissionTitles}
            role={memberDefaultQuery.data}
          />
        </TabsContent>

        <TabsContent value="defaults-guest" className="mt-4 sm:mt-6">
          <WorkspaceAccessDefaultRoleCard
            canManageRoles={canManageRoles}
            isLoading={guestDefaultQuery.isPending}
            memberType="GUEST"
            onEdit={(memberType) =>
              setRoleEditorState({
                memberType,
                mode: 'default',
                role: guestDefaultQuery.data ?? null,
              })
            }
            permissionCount={permissionCount}
            permissionTitles={permissionTitles}
            role={guestDefaultQuery.data}
          />
        </TabsContent>
      </Tabs>

      <WorkspaceAccessInviteDialog
        accessPreset={inviteAccessPreset}
        canManageRoles={canManageRoles}
        confirmDefaultAdminMigration={confirmDefaultAdminMigration}
        defaultAdminEnabled={defaultAdminEnabled}
        emails={inviteEmails}
        isSubmitting={inviteMutation.isPending}
        joinedMemberCount={joinedCount}
        onAccessPresetChange={(value) => {
          setInviteAccessPreset(value);
          if (value !== 'pos_operator') {
            setConfirmDefaultAdminMigration(false);
          }
        }}
        onConfirmDefaultAdminMigrationChange={setConfirmDefaultAdminMigration}
        onEmailsChange={setInviteEmails}
        onOpenChange={setInviteDialogOpen}
        onSubmit={() => inviteMutation.mutate()}
        open={inviteDialogOpen}
      />

      {profileMember ? (
        <WorkspaceAccessMemberProfileDialog
          key={`${profileMember.id ?? profileMember.email}-profile`}
          isSubmitting={updateMemberProfileMutation.isPending}
          member={profileMember}
          onOpenChange={(open) => {
            if (!open) setProfileMember(null);
          }}
          onSubmit={(displayName) =>
            updateMemberProfileMutation.mutate({
              displayName,
              member: profileMember,
            })
          }
          open
        />
      ) : null}

      {roleEditorState ? (
        <WorkspaceAccessRoleEditorDialog
          key={
            roleEditorState.mode === 'edit'
              ? `edit-${roleEditorState.role.id}`
              : roleEditorState.mode === 'default'
                ? `default-${roleEditorState.memberType}`
                : 'create'
          }
          adapter={adapter}
          currentUserEmail={context.currentUserEmail}
          onOpenChange={(open) => {
            if (!open) setRoleEditorState(null);
          }}
          open={Boolean(roleEditorState)}
          state={roleEditorState}
          workspaceId={workspaceId}
        />
      ) : null}

      {contextQuery.isError ? (
        <div className="flex items-center gap-2 rounded-xl border border-dynamic-red/20 bg-dynamic-red/5 p-4 text-dynamic-red text-sm">
          <TriangleAlert className="h-4 w-4 shrink-0" />
          {t('common.error')}
        </div>
      ) : null}
    </div>
  );
}
