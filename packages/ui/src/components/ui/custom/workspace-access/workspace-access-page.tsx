'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings } from '@tuturuuu/icons';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { WorkspaceDefaultPermissionMemberType } from '@tuturuuu/types';
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
}: WorkspaceAccessPageProps) {
  const t = useTranslations() as (key: string) => string;
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<WorkspaceAccessTab>(initialTab);
  const [status, setStatus] = useState<WorkspaceAccessMemberStatus>('all');
  const [search, setSearch] = useState('');
  const [inviteEmails, setInviteEmails] = useState('');
  const [inviteMemberType, setInviteMemberType] =
    useState<WorkspaceDefaultPermissionMemberType>('MEMBER');
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [filters, setFilters] = useState<MemberFiltersState>({
    permissionIds: [],
    roleIds: [],
  });
  const [roleEditorState, setRoleEditorState] =
    useState<WorkspaceAccessRoleEditorState | null>(null);

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
        emails: parseInviteEmails(inviteEmails),
        memberType: inviteMemberType,
      }),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('common.error')),
    onSuccess: async (result) => {
      setInviteEmails('');
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

  const roles = rolesQuery.data?.data ?? [];
  const sortedMembers = sortMembers(membersQuery.data ?? []);
  const visibleMembers = filterWorkspaceMembers(sortedMembers, {
    ...filters,
    search,
    status,
  });
  const joinedCount = sortedMembers.filter((member) => !member.pending).length;
  const invitedCount = sortedMembers.filter((member) => member.pending).length;
  const filterOptions = getMemberFilterOptions(
    sortedMembers,
    permissionDefinitions
  );

  if (contextQuery.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-12 rounded-lg" />
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <WorkspaceAccessPageHeader
        context={context}
        invitedCount={invitedCount}
        joinedCount={joinedCount}
        mode={mode}
        totalCount={sortedMembers.length}
      />

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

        <TabsContent value="people" className="mt-4">
          <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
            <WorkspaceAccessPeopleFilters
              filterOptions={filterOptions}
              filters={filters}
              labels={labels}
              onFiltersChange={setFilters}
              onStatusChange={setStatus}
              status={status}
            />

            <WorkspaceAccessMembers
              canManageMembers={canManageMembers}
              canManageRoles={canManageRoles}
              isLoading={membersQuery.isPending}
              isMutating={
                removeMemberMutation.isPending ||
                roleMembershipMutation.isPending
              }
              labels={labels}
              members={visibleMembers}
              onAssignRole={(payload) =>
                roleMembershipMutation.mutate({ ...payload, action: 'add' })
              }
              onRemoveMember={(payload) => removeMemberMutation.mutate(payload)}
              onRemoveRole={(payload) =>
                roleMembershipMutation.mutate({ ...payload, action: 'remove' })
              }
              roles={roles}
              searchTerm={search}
              status={status}
            />
          </div>
        </TabsContent>

        <TabsContent value="roles" className="mt-4">
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

        <TabsContent value="defaults-member" className="mt-4">
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

        <TabsContent value="defaults-guest" className="mt-4">
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
        emails={inviteEmails}
        isSubmitting={inviteMutation.isPending}
        memberType={inviteMemberType}
        onEmailsChange={setInviteEmails}
        onMemberTypeChange={setInviteMemberType}
        onOpenChange={setInviteDialogOpen}
        onSubmit={() => inviteMutation.mutate()}
        open={inviteDialogOpen}
      />

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
        <div className="rounded-lg border border-dynamic-red/20 bg-dynamic-red/5 p-4 text-dynamic-red text-sm">
          <Settings className="mr-2 inline h-4 w-4" />
          {t('common.error')}
        </div>
      ) : null}
    </div>
  );
}
