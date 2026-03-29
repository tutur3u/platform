'use client';

import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  useQueryState,
} from 'nuqs';
import { useMemo } from 'react';
import type { DatabaseLinkStatus } from '@/lib/users-database-filters';
import type { GroupMembershipFilter } from './group-membership';
import {
  useFeaturedGroupCounts,
  useFeaturedGroups,
  useWorkspaceUserGroups,
} from './hooks';

interface Props {
  wsId: string;
  initialFeaturedGroupIds?: string[];
  effectiveExcludedGroups?: string[];
  groupMembership?: GroupMembershipFilter;
  linkStatus?: DatabaseLinkStatus;
}

export function QuickGroupFilters({
  wsId,
  initialFeaturedGroupIds,
  effectiveExcludedGroups = [],
  groupMembership = 'all',
  linkStatus = 'all',
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

  const [includedGroups, setIncludedGroups] = useQueryState(
    'includedGroups',
    parseAsArrayOf(parseAsString).withDefault([]).withOptions({
      shallow: true,
    })
  );

  const [excludedGroups] = useQueryState(
    'excludedGroups',
    parseAsArrayOf(parseAsString).withOptions({
      shallow: true,
    })
  );

  const [q] = useQueryState(
    'q',
    parseAsString.withDefault('').withOptions({ shallow: true })
  );

  const [status] = useQueryState(
    'status',
    parseAsString.withDefault('active').withOptions({ shallow: true })
  );

  const [, setPage] = useQueryState(
    'page',
    parseAsInteger.withDefault(1).withOptions({ shallow: true })
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

  if (isLoadingFeatured || isLoadingGroups) return null;
  if (!featuredGroups.length) return null;

  const toggleGroup = (groupId: string) => {
    const isActive = includedGroups.includes(groupId);
    const newGroups = isActive
      ? includedGroups.filter((id) => id !== groupId)
      : [...includedGroups, groupId];

    setIncludedGroups(newGroups.length > 0 ? newGroups : null);
    setPage(1);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
        {t('quick_filters')}:
      </span>
      {featuredGroups.map((group) => {
        const isActive = includedGroups.includes(group.id);
        const count = groupCounts?.[group.id];
        return (
          <Button
            key={group.id}
            variant={isActive ? 'secondary' : 'outline'}
            size="sm"
            className={
              isActive
                ? 'h-8 rounded-xl px-3 text-xs'
                : 'h-8 rounded-xl border-dashed px-3 text-xs'
            }
            onClick={() => toggleGroup(group.id)}
          >
            {group.name}
            {showCounts && count != null && (
              <Badge
                variant="secondary"
                className="ml-1 h-4 min-w-4 justify-center rounded-full px-1 text-[10px] leading-none"
              >
                {count}
              </Badge>
            )}
          </Button>
        );
      })}
    </div>
  );
}
