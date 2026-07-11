'use client';

import {
  Activity,
  Archive,
  CircleSlash,
  CircleUserRound,
  Clock,
  Layers,
  Link,
  Link2Off,
  Settings2,
  ShieldAlert,
  Users,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import type { GroupMembershipFilter } from '@tuturuuu/users-core/database/group-membership';
import { getGroupMembershipTranslationKey } from '@tuturuuu/users-core/database/group-membership';
import type { DatabaseLinkStatus } from '@tuturuuu/users-core/lib/users-database-filters';
import type {
  UsersDatabaseRequireAttention,
  UsersDatabaseStatus,
} from '@tuturuuu/users-ui/database/resolved-filters';
import { useUserStatusLabels } from '@tuturuuu/users-ui/hooks/use-user-status-labels';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';

type FilterIcon = ComponentType<{ className?: string }>;

interface FilterOption<TValue extends string> {
  value: TValue;
  label: string;
  icon: FilterIcon;
}

interface UsersPrimaryFiltersDropdownProps {
  wsId: string;
  status: UsersDatabaseStatus;
  linkStatus: DatabaseLinkStatus;
  requireAttention: UsersDatabaseRequireAttention;
  groupMembership: GroupMembershipFilter;
  defaultLinkStatus: DatabaseLinkStatus;
  defaultGroupMembership: GroupMembershipFilter;
  onStatusChange: (value: UsersDatabaseStatus) => void;
  onLinkStatusChange: (value: DatabaseLinkStatus) => void;
  onRequireAttentionChange: (value: UsersDatabaseRequireAttention) => void;
  onGroupMembershipChange: (value: GroupMembershipFilter) => void;
}

const LINK_STATUS_OPTIONS = [
  {
    value: 'all',
    labelKey: 'link_status_all',
    icon: Users,
  },
  {
    value: 'linked',
    labelKey: 'link_status_linked',
    icon: Link,
  },
  {
    value: 'virtual',
    labelKey: 'link_status_virtual',
    icon: Link2Off,
  },
] as const satisfies ReadonlyArray<{
  value: DatabaseLinkStatus;
  labelKey: string;
  icon: FilterIcon;
}>;

const ATTENTION_OPTIONS = [
  {
    value: 'all',
    labelKey: 'attention_all',
    icon: Users,
  },
  {
    value: 'true',
    labelKey: 'attention_only',
    icon: ShieldAlert,
  },
  {
    value: 'false',
    labelKey: 'attention_none',
    icon: Link2Off,
  },
] as const satisfies ReadonlyArray<{
  value: UsersDatabaseRequireAttention;
  labelKey: string;
  icon: FilterIcon;
}>;

const GROUP_MEMBERSHIP_OPTIONS = [
  {
    value: 'all',
    icon: Layers,
  },
  {
    value: 'at-least-one',
    icon: Users,
  },
  {
    value: 'exactly-one',
    icon: CircleUserRound,
  },
  {
    value: 'none',
    icon: CircleSlash,
  },
] as const satisfies ReadonlyArray<{
  value: GroupMembershipFilter;
  icon: FilterIcon;
}>;

export function UsersPrimaryFiltersDropdown({
  wsId,
  status,
  linkStatus,
  requireAttention,
  groupMembership,
  defaultLinkStatus,
  defaultGroupMembership,
  onStatusChange,
  onLinkStatusChange,
  onRequireAttentionChange,
  onGroupMembershipChange,
}: UsersPrimaryFiltersDropdownProps) {
  const t = useTranslations('ws-users');
  const userStatusLabels = useUserStatusLabels(wsId);
  const activeCount = [
    status !== 'active',
    linkStatus !== defaultLinkStatus,
    requireAttention !== 'all',
    groupMembership !== defaultGroupMembership,
  ].filter(Boolean).length;

  const statusOptions = [
    {
      value: 'active',
      label: t('status_active'),
      icon: Activity,
    },
    {
      value: 'archived',
      label: userStatusLabels.archived,
      icon: Archive,
    },
    {
      value: 'archived_until',
      label: userStatusLabels.archived_until,
      icon: Clock,
    },
    {
      value: 'all',
      label: t('status_all'),
      icon: Layers,
    },
  ] as const satisfies ReadonlyArray<FilterOption<UsersDatabaseStatus>>;

  const linkStatusOptions = LINK_STATUS_OPTIONS.map((option) => ({
    ...option,
    label: t(option.labelKey),
  }));
  const attentionOptions = ATTENTION_OPTIONS.map((option) => ({
    ...option,
    label: t(option.labelKey),
  }));
  const groupMembershipOptions = GROUP_MEMBERSHIP_OPTIONS.map((option) => ({
    ...option,
    label: t(getGroupMembershipTranslationKey(option.value)),
  }));

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant={activeCount > 0 ? 'secondary' : 'outline'}
          size="sm"
          className="h-9 gap-2 rounded-md px-3"
        >
          <Settings2 className="h-4 w-4" />
          <span>{t('filters_button')}</span>
          {activeCount > 0 ? (
            <Badge variant="secondary" className="h-5 rounded-full px-1.5">
              {activeCount}
            </Badge>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <FilterRadioSection
          label={t('status_filter')}
          value={status}
          options={statusOptions}
          onValueChange={(value) => onStatusChange(value)}
        />
        <DropdownMenuSeparator />
        <FilterRadioSection
          label={t('link_status_filter')}
          value={linkStatus}
          options={linkStatusOptions}
          onValueChange={(value) => onLinkStatusChange(value)}
        />
        <DropdownMenuSeparator />
        <FilterRadioSection
          label={t('group_membership_filter')}
          value={groupMembership}
          options={groupMembershipOptions}
          onValueChange={(value) => onGroupMembershipChange(value)}
        />
        <DropdownMenuSeparator />
        <FilterRadioSection
          label={t('attention_filter')}
          value={requireAttention}
          options={attentionOptions}
          onValueChange={(value) => onRequireAttentionChange(value)}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FilterRadioSection<TValue extends string>({
  label,
  value,
  options,
  onValueChange,
}: {
  label: string;
  value: TValue;
  options: ReadonlyArray<FilterOption<TValue>>;
  onValueChange: (value: TValue) => void;
}) {
  return (
    <>
      <DropdownMenuLabel className="text-muted-foreground text-xs uppercase">
        {label}
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={value}
        onValueChange={(nextValue) => onValueChange(nextValue as TValue)}
      >
        {options.map((option) => {
          const Icon = option.icon;

          return (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <Icon className="h-4 w-4" />
              <span>{option.label}</span>
            </DropdownMenuRadioItem>
          );
        })}
      </DropdownMenuRadioGroup>
    </>
  );
}
