'use client';

import { CircleSlash, CircleUserRound, Layers, Users } from '@tuturuuu/icons';
import { ToggleGroup, ToggleGroupItem } from '@tuturuuu/ui/toggle-group';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';
import {
  type GroupMembershipFilter,
  getGroupMembershipTranslationKey,
} from './group-membership';

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
  icon: ComponentType<{ className?: string }>;
}>;

interface GroupMembershipFilterControlProps {
  value: GroupMembershipFilter;
  onChange: (value: GroupMembershipFilter) => void;
}

export function GroupMembershipFilterControl({
  value,
  onChange,
}: GroupMembershipFilterControlProps) {
  const t = useTranslations('ws-users');

  return (
    <div className="rounded-[20px] border border-border/70 bg-background/80 p-3 shadow-sm">
      <div className="mb-3 space-y-1">
        <p className="font-medium text-sm">{t('group_membership_filter')}</p>
        <p className="text-muted-foreground text-xs">
          {t('group_membership_hint')}
        </p>
      </div>

      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(nextValue) => {
          if (!nextValue) return;
          onChange(nextValue as GroupMembershipFilter);
        }}
        className="flex w-full flex-wrap justify-start gap-1 rounded-xl bg-muted/30 p-1"
        aria-label={t('group_membership_filter')}
      >
        {GROUP_MEMBERSHIP_OPTIONS.map((option) => {
          const Icon = option.icon;

          return (
            <ToggleGroupItem
              key={option.value}
              value={option.value}
              variant="outline"
              className="h-9 min-w-[10.5rem] flex-1 justify-start gap-2 rounded-lg border-0 bg-transparent px-3 text-left text-xs shadow-none data-[state=on]:bg-background data-[state=on]:shadow-sm"
              aria-label={t(getGroupMembershipTranslationKey(option.value))}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {t(getGroupMembershipTranslationKey(option.value))}
              </span>
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
    </div>
  );
}
