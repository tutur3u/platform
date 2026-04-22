'use client';

import { MailPlus } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { CmsMemberCards } from './cms-member-cards';
import { CmsMembersHeader } from './cms-members-header';
import type { CmsMembersSectionProps } from './cms-members-shared';
import { parseInviteEmails } from './cms-members-shared';
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

  return (
    <div className="space-y-6">
      <CmsMembersHeader
        boundProjectName={boundProjectName}
        canManageRoles={canManageRoles}
      />

      <Tabs
        value={state.activeTab}
        onValueChange={(value) => state.setActiveTab(value as any)}
        className="space-y-5"
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <TabsList className="grid w-full grid-cols-2 rounded-2xl md:w-auto md:grid-cols-4">
            <TabsTrigger value="all">{t('ws-members.all')}</TabsTrigger>
            <TabsTrigger value="joined">{t('ws-members.joined')}</TabsTrigger>
            <TabsTrigger value="invited">{t('ws-members.invited')}</TabsTrigger>
            <TabsTrigger value="roles">{t('common.roles')}</TabsTrigger>
          </TabsList>

          {state.activeTab === 'roles' ? (
            <div className="flex w-full flex-col gap-3 md:flex-row xl:w-auto">
              <Input
                value={state.roleSearch}
                onChange={(event) => state.setRoleSearch(event.target.value)}
                placeholder={t('common.search')}
                className="md:min-w-[260px]"
              />
              {canManageRoles ? (
                <>
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
                    onClick={() => state.setRoleEditorState({ mode: 'create' })}
                  >
                    {tRoles('create')}
                  </Button>
                </>
              ) : null}
            </div>
          ) : (
            <div className="grid w-full gap-3 xl:w-[440px]">
              <Input
                value={state.memberSearch}
                onChange={(event) => state.setMemberSearch(event.target.value)}
                placeholder={tSettings('search_members_placeholder')}
              />
              {canManageMembers ? (
                <div className="grid gap-2 rounded-2xl border border-border/70 bg-card/95 p-4">
                  <Textarea
                    rows={3}
                    value={state.inviteEmails}
                    onChange={(event) =>
                      state.setInviteEmails(event.target.value)
                    }
                    placeholder={tSettings('invite_members_placeholder')}
                  />
                  <Button
                    className="w-full sm:w-fit"
                    disabled={
                      state.inviteMutation.isPending ||
                      parseInviteEmails(state.inviteEmails).length === 0
                    }
                    onClick={() => state.inviteMutation.mutate()}
                  >
                    <MailPlus className="mr-2 h-4 w-4" />
                    {tSettings('send_invites_action')}
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <TabsContent value="all" className="mt-0">
          <CmsMemberCards
            canManageMembers={canManageMembers}
            canManageRoles={canManageRoles}
            isLoading={state.membersQuery.isPending}
            isRemovingMember={state.removeMemberMutation.isPending}
            members={state.visibleMembers}
            roles={state.rolesQuery.data ?? []}
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
          />
        </TabsContent>

        <TabsContent value="joined" className="mt-0">
          <CmsMemberCards
            canManageMembers={canManageMembers}
            canManageRoles={canManageRoles}
            isLoading={state.membersQuery.isPending}
            isRemovingMember={state.removeMemberMutation.isPending}
            members={state.visibleMembers}
            roles={state.rolesQuery.data ?? []}
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
          />
        </TabsContent>

        <TabsContent value="invited" className="mt-0">
          <CmsMemberCards
            canManageMembers={canManageMembers}
            canManageRoles={canManageRoles}
            isLoading={state.membersQuery.isPending}
            isRemovingMember={state.removeMemberMutation.isPending}
            members={state.visibleMembers}
            roles={state.rolesQuery.data ?? []}
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
