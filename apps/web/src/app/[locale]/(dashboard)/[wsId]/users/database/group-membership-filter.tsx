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
    <div className="flex h-fit w-full min-w-0 flex-col gap-3 rounded-2xl border border-border/60 bg-background/70 px-3 py-3 shadow-sm sm:px-4">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
        <Users className="h-3.5 w-3.5" />
        <span>{t('group_membership_filter')}</span>
      </div>

      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(nextValue) => {
          if (!nextValue) return;
          onChange(nextValue as GroupMembershipFilter);
        }}
        className="grid w-full grid-cols-2 gap-1.5 rounded-xl bg-muted/30 p-1.5 lg:grid-cols-4"
        aria-label={t('group_membership_filter')}
      >
        {GROUP_MEMBERSHIP_OPTIONS.map((option) => {
          const Icon = option.icon;

          return (
            <ToggleGroupItem
              key={option.value}
              value={option.value}
              variant="outline"
              className="h-10 justify-center gap-2 rounded-lg border-0 bg-transparent px-3 text-center text-xs shadow-none data-[state=on]:bg-background data-[state=on]:shadow-sm"
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
