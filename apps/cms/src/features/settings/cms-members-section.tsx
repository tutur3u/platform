'use client';

import {
  KeyRound,
  MailPlus,
  Search,
  Settings2,
  UserPlus,
  Users,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
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

export function CmsMembersSection({
  boundProjectName,
  canManageMembers,
  canManageRoles,
  currentUserEmail,
  workspaceId,
}: CmsMembersSectionProps) {
  const t = useTranslations();
  const tRoles = useTranslations('ws-roles');
  const tSettings = useTranslations('external-projects.settings');
  const state = useCmsMembersSection({
    canManageRoles,
    currentUserEmail,
    workspaceId,
  });
  const roleEditorKey =
    state.roleEditorState?.mode === 'edit'
      ? `edit-${state.roleEditorState.role.id}`
      : state.roleEditorState?.mode === 'default'
        ? 'default'
        : 'create';
  const isRolesTab = state.activeTab === 'roles';
  const filteredCount = isRolesTab
    ? state.filteredRoles.length
    : state.visibleMembers.length;
  const totalForActiveTab = state.tabCounts[state.activeTab];

  return (
    <div className="space-y-6">
      <CmsMembersHeader
        activeMembers={state.joinedCount}
        boundProjectName={boundProjectName}
        canManageRoles={canManageRoles}
        invitedMembers={state.invitedCount}
        membersWithRoles={state.membersWithRolesCount}
        roleAssignableMembers={state.roleAssignableMembersCount}
        totalMembers={state.tabCounts.all}
      />

      <Tabs
        value={state.activeTab}
        onValueChange={(value) => state.setActiveTab(value as CmsMemberTab)}
        className="space-y-6"
      >
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-4">
            <Card className="overflow-hidden rounded-[1.75rem] border-border/70 bg-card/90 shadow-none">
              <CardContent className="space-y-5 p-5 md:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2">
                    <Badge
                      variant="secondary"
                      className="rounded-full border border-border/60 bg-background/70 px-3 py-1"
                    >
                      {isRolesTab
                        ? tSettings('roles_surface_label')
                        : tSettings('directory_surface_label')}
                    </Badge>
                    <div className="space-y-1">
                      <h2 className="font-semibold text-2xl tracking-tight">
                        {isRolesTab
                          ? tSettings('roles_surface_title')
                          : tSettings('directory_surface_title')}
                      </h2>
                      <p className="max-w-2xl text-muted-foreground text-sm leading-6">
                        {isRolesTab
                          ? tSettings('roles_surface_description')
                          : tSettings('directory_description')}
                      </p>
                    </div>
                  </div>

                  <div className="grid min-w-[230px] gap-3 sm:grid-cols-2">
                    <CompactMetric
                      icon={<Users className="h-4 w-4 text-dynamic-blue" />}
                      label={tSettings('results_summary_label')}
                      value={tSettings('results_summary', {
                        total: totalForActiveTab,
                        visible: filteredCount,
                      })}
                    />
                    <CompactMetric
                      icon={<KeyRound className="h-4 w-4 text-dynamic-blue" />}
                      label={tSettings('members_needing_roles_label')}
                      value={state.membersNeedingRolesCount}
                    />
                  </div>
                </div>

                <TabsList className="grid h-auto w-full grid-cols-2 rounded-[1.25rem] bg-muted/60 p-1 md:grid-cols-4">
                  <DirectoryTabTrigger
                    count={state.tabCounts.all}
                    label={t('ws-members.all')}
                    value="all"
                  />
                  <DirectoryTabTrigger
                    count={state.tabCounts.joined}
                    label={t('ws-members.joined')}
                    value="joined"
                  />
                  <DirectoryTabTrigger
                    count={state.tabCounts.invited}
                    label={t('ws-members.invited')}
                    value="invited"
                  />
                  <DirectoryTabTrigger
                    count={state.tabCounts.roles}
                    label={t('common.roles')}
                    value="roles"
                  />
                </TabsList>
              </CardContent>
            </Card>

            <TabsContent value="all" className="mt-0">
              <CmsMemberCards
                activeTab="all"
                canManageMembers={canManageMembers}
                canManageRoles={canManageRoles}
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
                roles={state.rolesQuery.data ?? []}
                searchTerm={state.memberSearch}
              />
            </TabsContent>

            <TabsContent value="joined" className="mt-0">
              <CmsMemberCards
                activeTab="joined"
                canManageMembers={canManageMembers}
                canManageRoles={canManageRoles}
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
                roles={state.rolesQuery.data ?? []}
                searchTerm={state.memberSearch}
              />
            </TabsContent>

            <TabsContent value="invited" className="mt-0">
              <CmsMemberCards
                activeTab="invited"
                canManageMembers={canManageMembers}
                canManageRoles={canManageRoles}
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
                roles={state.rolesQuery.data ?? []}
                searchTerm={state.memberSearch}
              />
            </TabsContent>

            <TabsContent value="roles" className="mt-0">
              <CmsRolesPanel
                canManageRoles={canManageRoles}
                defaultRole={state.defaultRoleQuery.data}
                filteredRoles={state.filteredRoles}
                isDefaultRoleLoading={state.defaultRoleQuery.isPending}
                isRolesLoading={state.rolesQuery.isPending}
                members={state.membersQuery.data ?? []}
                onDeleteRole={(role) => state.setRoleToDelete(role)}
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
          </div>

          <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
            {isRolesTab ? (
              <>
                <Card className="rounded-[1.75rem] border-border/70 bg-card/90 shadow-none">
                  <CardContent className="space-y-4 p-5">
                    <div className="space-y-1">
                      <div className="inline-flex items-center gap-2 font-medium">
                        <Settings2 className="h-4 w-4 text-dynamic-blue" />
                        {tSettings('roles_tools_title')}
                      </div>
                      <p className="text-muted-foreground text-sm leading-6">
                        {tSettings('roles_tools_description')}
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div className="relative">
                        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={state.roleSearch}
                          onChange={(event) =>
                            state.setRoleSearch(event.target.value)
                          }
                          placeholder={t('common.search')}
                          className="pl-9"
                        />
                      </div>
                      {canManageRoles ? (
                        <div className="grid gap-2">
                          <Button
                            variant="outline"
                            onClick={() =>
                              state.setRoleEditorState({
                                mode: 'default',
                                role: state.defaultRoleQuery.data ?? null,
                              })
                            }
                          >
                            {tRoles('manage_default_permissions')}
                          </Button>
                          <Button
                            onClick={() =>
                              state.setRoleEditorState({ mode: 'create' })
                            }
                          >
                            {tRoles('create')}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-[1.75rem] border-border/70 bg-card/90 shadow-none">
                  <CardContent className="space-y-3 p-5">
                    <SidebarMetric
                      label={t('common.roles')}
                      value={state.roleCount}
                    />
                    <SidebarMetric
                      label={t('ws-members.total_permissions')}
                      value={state.permissionCount}
                    />
                    <SidebarMetric
                      label={tSettings('results_summary_label')}
                      value={tSettings('results_summary', {
                        total: totalForActiveTab,
                        visible: filteredCount,
                      })}
                    />
                  </CardContent>
                </Card>
              </>
            ) : (
              <>
                <Card className="rounded-[1.75rem] border-border/70 bg-card/90 shadow-none">
                  <CardContent className="space-y-4 p-5">
                    <div className="space-y-1">
                      <div className="inline-flex items-center gap-2 font-medium">
                        <Search className="h-4 w-4 text-dynamic-blue" />
                        {tSettings('search_members_label')}
                      </div>
                      <p className="text-muted-foreground text-sm leading-6">
                        {tSettings('search_description')}
                      </p>
                    </div>

                    <div className="relative">
                      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={state.memberSearch}
                        onChange={(event) =>
                          state.setMemberSearch(event.target.value)
                        }
                        placeholder={tSettings('search_members_placeholder')}
                        className="pl-9"
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Badge
                        variant="secondary"
                        className="rounded-full border border-border/60 bg-background/70"
                      >
                        {tSettings('results_summary', {
                          total: totalForActiveTab,
                          visible: filteredCount,
                        })}
                      </Badge>
                      {state.hasMemberSearch ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => state.setMemberSearch('')}
                        >
                          {t('common.clear')}
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>

                {canManageMembers ? (
                  <Card className="rounded-[1.75rem] border-border/70 bg-gradient-to-br from-background via-background to-dynamic-blue/5 shadow-none">
                    <CardContent className="space-y-4 p-5">
                      <div className="space-y-1">
                        <div className="inline-flex items-center gap-2 font-medium">
                          <UserPlus className="h-4 w-4 text-dynamic-blue" />
                          {tSettings('invite_panel_title')}
                        </div>
                        <p className="text-muted-foreground text-sm leading-6">
                          {tSettings('invite_helper')}
                        </p>
                      </div>

                      <Textarea
                        rows={5}
                        value={state.inviteEmails}
                        onChange={(event) =>
                          state.setInviteEmails(event.target.value)
                        }
                        placeholder={tSettings('invite_members_placeholder')}
                        className="bg-background/80"
                      />

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <Badge
                          variant="secondary"
                          className="rounded-full border border-border/60 bg-background/70"
                        >
                          {tSettings('invite_ready', {
                            count: state.inviteEmailCount,
                          })}
                        </Badge>
                        <Button
                          disabled={
                            state.inviteMutation.isPending ||
                            state.inviteEmailCount === 0
                          }
                          onClick={() => state.inviteMutation.mutate()}
                        >
                          <MailPlus className="mr-2 h-4 w-4" />
                          {tSettings('send_invites_action')}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : null}

                <Card className="rounded-[1.75rem] border-border/70 bg-card/90 shadow-none">
                  <CardContent className="space-y-3 p-5">
                    <SidebarMetric
                      label={t('ws-members.active_members')}
                      value={state.joinedCount}
                    />
                    <SidebarMetric
                      label={t('ws-members.pending_invitations')}
                      value={state.invitedCount}
                    />
                    <SidebarMetric
                      label={t('ws-members.guest_badge')}
                      value={state.guestsCount}
                    />
                    <SidebarMetric
                      label={tSettings('members_needing_roles_label')}
                      value={state.membersNeedingRolesCount}
                    />
                    <SidebarMetric
                      label={t('ws-members.total_permissions')}
                      value={state.totalUniquePermissions}
                    />
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </Tabs>

      {state.roleEditorState ? (
        <CmsRoleEditorDialog
          key={roleEditorKey}
          currentUserEmail={currentUserEmail}
          initialRole={
            state.roleEditorState.mode === 'create'
              ? null
              : state.roleEditorState.role
          }
          mode={state.roleEditorState.mode}
          onOpenChange={(open) => {
            if (!open) {
              state.setRoleEditorState(null);
            }
          }}
          onSaved={state.invalidateAccessData}
          open={Boolean(state.roleEditorState)}
          workspaceId={workspaceId}
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

function CompactMetric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-muted-foreground text-xs uppercase tracking-[0.16em]">
          {label}
        </div>
        {icon}
      </div>
      <div className="mt-2 font-semibold text-base">{value}</div>
    </div>
  );
}

function DirectoryTabTrigger({
  count,
  label,
  value,
}: {
  count: number;
  label: string;
  value: CmsMemberTab;
}) {
  return (
    <TabsTrigger
      value={value}
      className="flex h-auto flex-col items-start gap-1 rounded-[1rem] px-4 py-3 text-left"
    >
      <span>{label}</span>
      <span className="text-muted-foreground text-xs">{count}</span>
    </TabsTrigger>
  );
}

function SidebarMetric({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/70 px-4 py-3">
      <div className="text-muted-foreground text-sm">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
