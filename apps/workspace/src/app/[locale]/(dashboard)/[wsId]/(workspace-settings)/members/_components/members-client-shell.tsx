'use client';

import { Settings } from '@tuturuuu/icons';
import type { Workspace } from '@tuturuuu/types';
import type { User } from '@tuturuuu/types/primitives/User';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { permissionGroups } from '@tuturuuu/utils/permissions';
import { useTranslations } from 'next-intl';
import {
  parseAsArrayOf,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
} from 'nuqs';
import { useMemo } from 'react';
import { GuestSelfJoinSetting } from './guest-self-join-setting';
import InviteLinksSection from './invite-links-section';
import InviteMemberButton from './invite-member-button';
import {
  filterWorkspaceMembers,
  getMemberFilterOptions,
} from './member-filter-utils';
import { MemberFilters } from './member-filters';
import MemberList from './member-list';
import MemberTabs from './member-tabs';
import { memberStatusValues, useWorkspaceMembers } from './members-queries';

interface Props {
  workspace: Workspace;
  wsId: string;
  currentUser?: User | null;
  canManageMembers: boolean;
  disableInvite: boolean;
}

export default function MembersClientShell({
  workspace,
  wsId,
  currentUser,
  canManageMembers,
  disableInvite,
}: Props) {
  const t = useTranslations();
  const tMembers = useTranslations('ws-members');
  const [status] = useQueryState(
    'status',
    parseAsStringLiteral(memberStatusValues)
      .withDefault('all')
      .withOptions({ shallow: true })
  );
  const [selectedRoleIds, setSelectedRoleIds] = useQueryState(
    'roleIds',
    parseAsArrayOf(parseAsString).withDefault([]).withOptions({
      shallow: true,
    })
  );
  const [selectedPermissionIds, setSelectedPermissionIds] = useQueryState(
    'permissions',
    parseAsArrayOf(parseAsString).withDefault([]).withOptions({
      shallow: true,
    })
  );

  const { data, isPending, isError } = useWorkspaceMembers(wsId, status);
  const members = data ?? [];

  const permissionDefinitions = useMemo(
    () =>
      permissionGroups({
        t: t as unknown as (key: string) => string,
        user: null,
        wsId,
      }).flatMap((group) =>
        group.permissions.map((permission) => ({
          groupTitle: group.title,
          id: permission.id,
          title: permission.title,
        }))
      ),
    [t, wsId]
  );
  const filterOptions = useMemo(
    () => getMemberFilterOptions(members, permissionDefinitions),
    [members, permissionDefinitions]
  );
  const filteredMembers = useMemo(
    () =>
      filterWorkspaceMembers(members, {
        permissionIds: selectedPermissionIds,
        roleIds: selectedRoleIds,
      }),
    [members, selectedPermissionIds, selectedRoleIds]
  );
  const hasActiveFilters =
    selectedRoleIds.length > 0 || selectedPermissionIds.length > 0;

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-xl border border-border bg-linear-to-br from-background via-background to-foreground/2 p-6 shadow-sm">
        <div className="pointer-events-none absolute -top-4 -right-4 h-32 w-32 rounded-full bg-dynamic-blue/5 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-4 -left-4 h-32 w-32 rounded-full bg-dynamic-purple/5 blur-2xl" />

        <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-start">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br from-dynamic-blue to-dynamic-purple shadow-lg">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-6 w-6 text-background"
                >
                  <title>{t('workspace-settings-layout.members')}</title>
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <h1 className="bg-linear-to-br from-foreground to-foreground/70 bg-clip-text font-bold text-3xl text-transparent">
                {t('workspace-settings-layout.members')}
              </h1>
            </div>
            <p className="ml-15 max-w-2xl text-foreground/70 text-lg leading-relaxed">
              {t('ws-members.description')}
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-stretch gap-3 md:flex-row md:items-center">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="default" className="gap-2">
                  <Settings className="h-4 w-4" />
                  {tMembers('member-settings')}
                </Button>
              </DialogTrigger>
              <DialogContent
                className="sm:max-w-lg"
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                <DialogHeader>
                  <DialogTitle>{tMembers('member-settings')}</DialogTitle>
                  <DialogDescription>
                    {tMembers('members_workspace_settings_description')}
                  </DialogDescription>
                </DialogHeader>
                <GuestSelfJoinSetting
                  wsId={wsId}
                  disabled={!canManageMembers}
                  embedded
                />
              </DialogContent>
            </Dialog>
            <MemberTabs value={status} />
            <InviteMemberButton
              wsId={wsId}
              currentUser={currentUser ?? undefined}
              canManageMembers={canManageMembers}
              label={
                disableInvite
                  ? t('ws-members.invite_member_disabled')
                  : t('ws-members.invite_member')
              }
              disabled={disableInvite}
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
        {isError ? (
          <div className="rounded-lg border border-dynamic-red/20 bg-dynamic-red/5 p-6 text-dynamic-red text-sm">
            {t('common.error')}
          </div>
        ) : (
          <>
            <MemberFilters
              permissionOptions={filterOptions.permissions}
              roleOptions={filterOptions.roles}
              selectedPermissionIds={selectedPermissionIds}
              selectedRoleIds={selectedRoleIds}
              setSelectedPermissionIds={setSelectedPermissionIds}
              setSelectedRoleIds={setSelectedRoleIds}
              shownCount={filteredMembers.length}
              totalCount={members.length}
            />
            <MemberList
              workspace={workspace}
              members={filteredMembers}
              invited={status === 'invited'}
              loading={isPending}
              canManageMembers={canManageMembers}
              currentUser={currentUser}
              filtersActive={hasActiveFilters}
            />
          </>
        )}
      </div>

      <InviteLinksSection wsId={wsId} canManageMembers={canManageMembers} />
    </div>
  );
}
