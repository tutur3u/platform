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
  'h-9 min-w-0 gap-1.5 rounded-lg px-2 text-muted-foreground shadow-none transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm sm:px-3';

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
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <TabsList className="grid h-auto w-full grid-cols-4 gap-1 rounded-xl border bg-muted/30 p-1 lg:w-auto">
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            disabled={tab.disabled}
            className={TAB_TRIGGER_CLASS}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sr-only sm:hidden">{tab.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>

      <div className="flex w-full shrink-0 gap-2 lg:w-auto">
        <div className="relative min-w-0 flex-1 lg:w-80 lg:flex-none">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t('ws-members.search_members')}
            className="pl-9"
          />
        </div>
        {activeTab === 'people' ? (
          <Button
            disabled={!canInvite}
            onClick={onInviteClick}
            className="shrink-0 px-3 sm:px-4"
          >
            <UserPlus className="size-4 sm:mr-2" />
            <span className="hidden sm:inline">
              {disableInvite
                ? t('ws-members.invite_member_disabled')
                : t('ws-members.invite_member')}
            </span>
            <span className="sr-only sm:hidden">
              {t('ws-members.invite_member')}
            </span>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
