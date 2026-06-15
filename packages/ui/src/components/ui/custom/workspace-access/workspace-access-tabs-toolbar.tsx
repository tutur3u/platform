'use client';

import {
  KeyRound,
  Search,
  ShieldCheck,
  ShieldUser,
  UserPlus,
  Users,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { WorkspaceAccessTab } from './types';

type Props = {
  activeTab: WorkspaceAccessTab;
  accessLevelsLabel: string;
  canInvite: boolean;
  canManageRoles: boolean;
  disableInvite: boolean;
  onInviteClick: () => void;
  onSearchChange: (value: string) => void;
  search: string;
};

const TAB_TRIGGER_CLASS =
  'rounded-none border-transparent border-b-2 bg-transparent px-1 pt-1 pb-3 text-muted-foreground shadow-none transition-colors hover:text-foreground data-[state=active]:border-dynamic-blue data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none';

export function WorkspaceAccessTabsToolbar({
  activeTab,
  accessLevelsLabel,
  canInvite,
  canManageRoles,
  disableInvite,
  onInviteClick,
  onSearchChange,
  search,
}: Props) {
  const t = useTranslations() as (key: string) => string;

  const tabs: Array<{
    disabled?: boolean;
    icon: ReactNode;
    label: string;
    value: WorkspaceAccessTab;
  }> = [
    {
      icon: <Users className="h-4 w-4" />,
      label: t('ws-roles.members'),
      value: 'people',
    },
    {
      disabled: !canManageRoles,
      icon: <ShieldCheck className="h-4 w-4" />,
      label: accessLevelsLabel,
      value: 'roles',
    },
    {
      disabled: !canManageRoles,
      icon: <ShieldUser className="h-4 w-4" />,
      label: t('ws-roles.member_defaults_tab'),
      value: 'defaults-member',
    },
    {
      disabled: !canManageRoles,
      icon: <KeyRound className="h-4 w-4" />,
      label: t('ws-roles.guest_defaults_tab'),
      value: 'defaults-guest',
    },
  ];

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <TabsList className="h-auto w-full justify-start gap-5 overflow-x-auto rounded-none border-border border-b bg-transparent p-0 lg:w-auto">
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            disabled={tab.disabled}
            className={TAB_TRIGGER_CLASS}
          >
            {tab.icon}
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <div className="flex w-full shrink-0 flex-col gap-2 sm:flex-row lg:w-auto">
        <div className="relative min-w-0 sm:min-w-[280px]">
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
