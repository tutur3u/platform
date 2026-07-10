'use client';

import { Users } from '@tuturuuu/icons';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import type { GroupMembershipFilter } from '@tuturuuu/users-core/database/group-membership';
import type { DatabaseLinkStatus } from '@tuturuuu/users-core/lib/users-database-filters';
import {
  useFeaturedGroupCounts,
  useFeaturedGroups,
  useWorkspaceUserGroups,
} from '@tuturuuu/users-ui/database/hooks';
import { useTranslations } from 'next-intl';
import { parseAsString, useQueryState } from 'nuqs';
import { useMemo } from 'react';

interface Props {
  wsId: string;
  initialFeaturedGroupIds?: string[];
  includedGroups?: string[];
  excludedGroups?: string[] | null;
  effectiveIncludedGroups?: string[];
  effectiveExcludedGroups?: string[];
  groupMembership?: GroupMembershipFilter;
  linkStatus?: DatabaseLinkStatus;
  onIncludedGroupsChange?: (value: string[]) => Promise<void> | void;
}

export function QuickGroupFilters({
  wsId,
  initialFeaturedGroupIds,
  includedGroups = [],
  excludedGroups = null,
  effectiveIncludedGroups = [],
  effectiveExcludedGroups = [],
  groupMembership = 'all',
  linkStatus = 'all',
  onIncludedGroupsChange,
}: Props) {
  const t = useTranslations('user-data-table');

  const { data: featuredGroupIds, isLoading: isLoadingFeatured } =
    useFeaturedGroups(wsId, {
      initialData: initialFeaturedGroupIds,
    });
  const { data: allGroups, isLoading: isLoadingGroups } =
    useWorkspaceUserGroups(wsId, {
      ensureGroupIds: featuredGroupIds,
    });

  const [q] = useQueryState(
    'q',
    parseAsString.withDefault('').withOptions({ shallow: true })
  );

  const [status] = useQueryState(
    'status',
    parseAsString.withDefault('active').withOptions({ shallow: true })
  );

  // Resolve featured group IDs to full group objects
  const featuredGroups = useMemo(() => {
    if (!featuredGroupIds?.length || !allGroups?.length) return [];
    const groupMap = new Map(allGroups.map((g) => [g.id, g]));
    return featuredGroupIds
      .map((id) => groupMap.get(id))
      .filter((g): g is UserGroup => !!g);
  }, [featuredGroupIds, allGroups]);

  const { data: groupCounts } = useFeaturedGroupCounts(
    wsId,
    featuredGroupIds ?? [],
    {
      excludedGroups:
        excludedGroups === null ? effectiveExcludedGroups : excludedGroups,
      searchQuery: q,
      status,
      linkStatus,
    }
  );
  const showCounts = groupMembership === 'all';
  const selectedIncludedGroups =
    includedGroups.length > 0 ? includedGroups : effectiveIncludedGroups;

  if (isLoadingFeatured || isLoadingGroups) return null;
  if (!featuredGroups.length) return null;

  const toggleGroup = (groupId: string) => {
    const isActive = selectedIncludedGroups.includes(groupId);
    const newGroups = isActive
      ? selectedIncludedGroups.filter((id) => id !== groupId)
      : [...selectedIncludedGroups, groupId];

    void onIncludedGroupsChange?.(newGroups);
  };

  const activeFeaturedCount = featuredGroups.filter((group) =>
    selectedIncludedGroups.includes(group.id)
  ).length;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant={activeFeaturedCount > 0 ? 'secondary' : 'outline'}
          size="sm"
          className="h-9 gap-2 rounded-md px-3"
        >
          <Users className="h-4 w-4" />
          <span>{t('quick_filters')}</span>
          {activeFeaturedCount > 0 ? (
            <Badge variant="secondary" className="h-5 rounded-full px-1.5">
              {activeFeaturedCount}
            </Badge>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel className="text-muted-foreground text-xs uppercase">
          {t('quick_filters')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {featuredGroups.map((group) => {
          const isActive = selectedIncludedGroups.includes(group.id);
          const count = groupCounts?.[group.id];

          return (
            <DropdownMenuCheckboxItem
              key={group.id}
              checked={isActive}
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={() => toggleGroup(group.id)}
              className="gap-3"
            >
              <span className="min-w-0 flex-1 truncate">{group.name}</span>
              {showCounts && count != null ? (
                <Badge
                  variant="secondary"
                  className="h-5 min-w-5 justify-center rounded-full px-1.5 text-[10px]"
                >
                  {count}
                </Badge>
              ) : null}
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
