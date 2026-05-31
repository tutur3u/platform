'use client';

import { Plus, Search, UserPlus } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Input } from '@tuturuuu/ui/input';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { CmsInviteMembersDialog } from './cms-invite-members-dialog';
import { CmsMemberCards } from './cms-member-cards';
import { CmsMembersHeader } from './cms-members-header';
import type {
  CmsMembersSectionProps,
  CmsMemberTab,
} from './cms-members-shared';
import { CmsRoleDeleteDialog } from './cms-role-delete-dialog';
import { CmsRoleEditorDialog } from './cms-role-editor-dialog';
import { CmsRolesPanel } from './cms-roles-panel';
import { useCmsMembersSection } from './use-cms-members-section';

export function CmsMembersSection({ workspaceSlug }: CmsMembersSectionProps) {
  const t = useTranslations();
  const tRoles = useTranslations('ws-roles');
  const tSettings = useTranslations('external-projects.settings');
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const state = useCmsMembersSection({
    workspaceSlug,
  });
  const roleEditorKey =
    state.roleEditorState?.mode === 'edit'
      ? `edit-${state.roleEditorState.role.id}`
      : state.roleEditorState?.mode === 'default'
        ? `default-${state.roleEditorState.memberType}`
        : 'create';

  if (state.contextQuery.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-14 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (state.contextQuery.isError) {
    return (
      <Card className="border-border/70 shadow-none">
        <CardContent className="flex min-h-56 items-center justify-center p-6 text-center text-muted-foreground text-sm">
          {state.contextQuery.error instanceof Error
            ? state.contextQuery.error.message
            : t('common.error')}
        </CardContent>
      </Card>
    );
  }

  const isRolesTab = state.activeTab === 'roles';
  const roles = state.rolesQuery.data ?? [];
  const permissionOptions = Array.from(state.permissionTitles.entries()).sort(
    ([left], [right]) => left.localeCompare(right)
  );
  const hasPeopleFilters =
    state.selectedRoleIds.size > 0 || state.selectedPermissionIds.size > 0;

  return (
    <div className="space-y-6">
      <CmsMembersHeader
        boundProjectName={state.boundProjectName}
        invitedCount={state.invitedCount}
        joinedCount={state.joinedCount}
        totalCount={state.tabCounts.all}
      />

      <Tabs
        value={state.activeTab}
        onValueChange={(value) => state.setActiveTab(value as CmsMemberTab)}
        className="space-y-4"
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:grid-cols-4 md:w-auto">
            <TabsTrigger value="all">{t('ws-members.all')}</TabsTrigger>
            <TabsTrigger value="joined">{t('ws-members.joined')}</TabsTrigger>
            <TabsTrigger value="invited">{t('ws-members.invited')}</TabsTrigger>
            <TabsTrigger value="roles">
              {tSettings('roles_surface_title')}
            </TabsTrigger>
          </TabsList>

          <div className="flex w-full flex-col gap-3 sm:flex-row md:w-auto">
            <div className="relative min-w-0 sm:min-w-[320px]">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={isRolesTab ? state.roleSearch : state.memberSearch}
                onChange={(event) =>
                  isRolesTab
                    ? state.setRoleSearch(event.target.value)
                    : state.setMemberSearch(event.target.value)
                }
                placeholder={
                  isRolesTab
                    ? t('common.search')
                    : tSettings('search_members_placeholder')
                }
                className="pl-9"
              />
            </div>

            {isRolesTab ? (
              state.canManageRoles ? (
                <Button
                  onClick={() => state.setRoleEditorState({ mode: 'create' })}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {tRoles('create')}
                </Button>
              ) : null
            ) : state.canManageMembers ? (
              <Button onClick={() => setInviteDialogOpen(true)}>
                <UserPlus className="mr-2 h-4 w-4" />
                {t('ws-members.invite_member')}
              </Button>
            ) : null}
          </div>
        </div>

        {!isRolesTab ? (
          <div className="rounded-xl border border-border/70 bg-card/80 p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="rounded-full">
                  {tSettings('results_summary', {
                    total: state.tabCounts[state.activeTab],
                    visible: state.visibleMembers.length,
                  })}
                </Badge>
                <Badge variant="outline" className="rounded-full">
                  {tSettings('members_needing_roles_label')}:{' '}
                  {state.membersNeedingRolesCount}
                </Badge>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      {tSettings('filter_by_access_level')}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuLabel>
                      {tSettings('access_levels_label')}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {roles.length === 0 ? (
                      <div className="px-2 py-1.5 text-muted-foreground text-sm">
                        {tSettings('roles_empty_title')}
                      </div>
                    ) : (
                      roles.map((role) => (
                        <DropdownMenuCheckboxItem
                          key={role.id}
                          checked={state.selectedRoleIds.has(role.id)}
                          onCheckedChange={(checked) => {
                            const next = new Set(state.selectedRoleIds);

                            if (checked) {
                              next.add(role.id);
                            } else {
                              next.delete(role.id);
                            }

                            state.setSelectedRoleIds(next);
                          }}
                        >
                          {role.name}
                        </DropdownMenuCheckboxItem>
                      ))
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      {tSettings('filter_by_permission')}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="max-h-80 w-72 overflow-y-auto"
                  >
                    <DropdownMenuLabel>
                      {t('ws-roles.permissions')}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {permissionOptions.map(([permissionId, label]) => (
                      <DropdownMenuCheckboxItem
                        key={permissionId}
                        checked={state.selectedPermissionIds.has(permissionId)}
                        onCheckedChange={(checked) => {
                          const next = new Set(state.selectedPermissionIds);

                          if (checked) {
                            next.add(permissionId);
                          } else {
                            next.delete(permissionId);
                          }

                          state.setSelectedPermissionIds(next);
                        }}
                      >
                        {label}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {hasPeopleFilters ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      state.setSelectedPermissionIds(new Set());
                      state.setSelectedRoleIds(new Set());
                    }}
                  >
                    {tSettings('clear_filters_action')}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        <TabsContent value="all" className="mt-0">
          <CmsMemberCards
            activeTab="all"
            canManageMembers={state.canManageMembers}
            canManageRoles={state.canManageRoles}
            isLoading={state.membersQuery.isPending}
            isRemovingMember={state.removeMemberMutation.isPending}
            members={state.visibleMembers}
            onAssignRole={({ roleId, userId }) =>
              state.roleMembershipMutation.mutate({
                action: 'add',
                roleId,
                userId,
              })
            }
            onRemoveMember={(payload) =>
              state.removeMemberMutation.mutate(payload)
            }
            onRemoveRole={({ roleId, userId }) =>
              state.roleMembershipMutation.mutate({
                action: 'remove',
                roleId,
                userId,
              })
            }
            roles={roles}
            searchTerm={state.memberSearch}
          />
        </TabsContent>

        <TabsContent value="joined" className="mt-0">
          <CmsMemberCards
            activeTab="joined"
            canManageMembers={state.canManageMembers}
            canManageRoles={state.canManageRoles}
            isLoading={state.membersQuery.isPending}
            isRemovingMember={state.removeMemberMutation.isPending}
            members={state.visibleMembers}
            onAssignRole={({ roleId, userId }) =>
              state.roleMembershipMutation.mutate({
                action: 'add',
                roleId,
                userId,
              })
            }
            onRemoveMember={(payload) =>
              state.removeMemberMutation.mutate(payload)
            }
            onRemoveRole={({ roleId, userId }) =>
              state.roleMembershipMutation.mutate({
                action: 'remove',
                roleId,
                userId,
              })
            }
            roles={roles}
            searchTerm={state.memberSearch}
          />
        </TabsContent>

        <TabsContent value="invited" className="mt-0">
          <CmsMemberCards
            activeTab="invited"
            canManageMembers={state.canManageMembers}
            canManageRoles={state.canManageRoles}
            isLoading={state.membersQuery.isPending}
            isRemovingMember={state.removeMemberMutation.isPending}
            members={state.visibleMembers}
            onAssignRole={({ roleId, userId }) =>
              state.roleMembershipMutation.mutate({
                action: 'add',
                roleId,
                userId,
              })
            }
            onRemoveMember={(payload) =>
              state.removeMemberMutation.mutate(payload)
            }
            onRemoveRole={({ roleId, userId }) =>
              state.roleMembershipMutation.mutate({
                action: 'remove',
                roleId,
                userId,
              })
            }
            roles={roles}
            searchTerm={state.memberSearch}
          />
        </TabsContent>

        <TabsContent value="roles" className="mt-0">
          <CmsRolesPanel
            canManageRoles={state.canManageRoles}
            filteredRoles={state.filteredRoles}
            guestDefaultRole={state.guestDefaultRoleQuery.data}
            isGuestDefaultRoleLoading={state.guestDefaultRoleQuery.isPending}
            isMemberDefaultRoleLoading={state.memberDefaultRoleQuery.isPending}
            isRolesLoading={state.rolesQuery.isPending}
            memberDefaultRole={state.memberDefaultRoleQuery.data}
            members={state.membersQuery.data ?? []}
            onDeleteRole={(role) => state.setRoleToDelete(role)}
            onEditDefaultRole={(memberType) =>
              state.setRoleEditorState({
                memberType,
                mode: 'default',
                role:
                  memberType === 'GUEST'
                    ? (state.guestDefaultRoleQuery.data ?? null)
                    : (state.memberDefaultRoleQuery.data ?? null),
              })
            }
            onEditRole={(role) =>
              state.setRoleEditorState({
                mode: 'edit',
                role,
              })
            }
            permissionCount={state.permissionCount}
            permissionTitles={state.permissionTitles}
          />
        </TabsContent>
      </Tabs>

      <CmsInviteMembersDialog
        inviteCount={state.inviteEmailCount}
        inviteEmails={state.inviteEmails}
        isSubmitting={state.inviteMutation.isPending}
        onInviteEmailsChange={state.setInviteEmails}
        onOpenChange={setInviteDialogOpen}
        onSubmit={() =>
          state.inviteMutation.mutate(undefined, {
            onSuccess: () => setInviteDialogOpen(false),
          })
        }
        open={inviteDialogOpen}
      />

      {state.roleEditorState ? (
        <CmsRoleEditorDialog
          key={roleEditorKey}
          currentUserEmail={state.currentUserEmail}
          initialRole={
            state.roleEditorState.mode === 'create'
              ? null
              : state.roleEditorState.role
          }
          defaultMemberType={
            state.roleEditorState.mode === 'default'
              ? state.roleEditorState.memberType
              : undefined
          }
          mode={state.roleEditorState.mode}
          onOpenChange={(open) => {
            if (!open) {
              state.setRoleEditorState(null);
            }
          }}
          onSaved={state.invalidateAccessData}
          open={Boolean(state.roleEditorState)}
          workspaceId={state.workspaceId ?? workspaceSlug}
        />
      ) : null}

      <CmsRoleDeleteDialog
        isDeleting={state.deleteRoleMutation.isPending}
        onConfirm={() => {
          if (state.roleToDelete) {
            state.deleteRoleMutation.mutate(state.roleToDelete.id);
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            state.setRoleToDelete(null);
          }
        }}
        role={state.roleToDelete}
      />
    </div>
  );
}
