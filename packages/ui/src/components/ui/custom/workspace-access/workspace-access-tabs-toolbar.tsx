'use client';

import { Search, UserPlus } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import type { WorkspaceAccessTab } from './types';

type Props = {
  activeTab: WorkspaceAccessTab;
  canInvite: boolean;
  canManageRoles: boolean;
  disableInvite: boolean;
  onInviteClick: () => void;
  onSearchChange: (value: string) => void;
  search: string;
};

export function WorkspaceAccessTabsToolbar({
  activeTab,
  canInvite,
  canManageRoles,
  disableInvite,
  onInviteClick,
  onSearchChange,
  search,
}: Props) {
  const t = useTranslations() as (key: string) => string;

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <TabsList className="grid h-auto w-full grid-cols-2 lg:w-auto lg:grid-cols-4">
        <TabsTrigger value="people">{t('ws-roles.members')}</TabsTrigger>
        <TabsTrigger value="roles" disabled={!canManageRoles}>
          {t('ws-roles.plural')}
        </TabsTrigger>
        <TabsTrigger value="defaults-member" disabled={!canManageRoles}>
          {t('ws-roles.member_defaults_tab')}
        </TabsTrigger>
        <TabsTrigger value="defaults-guest" disabled={!canManageRoles}>
          {t('ws-roles.guest_defaults_tab')}
        </TabsTrigger>
      </TabsList>

      <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
        <div className="relative min-w-0 sm:min-w-[320px]">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t('common.search')}
            className="pl-9"
          />
        </div>
        {activeTab === 'people' ? (
          <Button disabled={!canInvite} onClick={onInviteClick}>
            <UserPlus className="mr-2 h-4 w-4" />
            {disableInvite
              ? t('ws-members.invite_member_disabled')
              : t('ws-members.invite_member')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
