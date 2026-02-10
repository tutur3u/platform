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
import { useFeaturedGroups, useWorkspaceUserGroups } from './hooks';

interface Props {
  wsId: string;
}

export function QuickGroupFilters({ wsId }: Props) {
  const t = useTranslations('user-data-table');

  const { data: featuredGroupIds, isLoading: isLoadingFeatured } =
    useFeaturedGroups(wsId);
  const { data: allGroups, isLoading: isLoadingGroups } =
    useWorkspaceUserGroups(wsId);

  const [includedGroups, setIncludedGroups] = useQueryState(
    'includedGroups',
    parseAsArrayOf(parseAsString).withDefault([]).withOptions({
      shallow: true,
    })
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
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-muted-foreground text-xs">
        {t('quick_filters')}:
      </span>
      {featuredGroups.map((group) => {
        const isActive = includedGroups.includes(group.id);
        return (
          <Button
            key={group.id}
            variant={isActive ? 'secondary' : 'outline'}
            size="sm"
            className={isActive ? 'h-7 text-xs' : 'h-7 border-dashed text-xs'}
            onClick={() => toggleGroup(group.id)}
          >
            {group.name}
            {group.amount != null && (
              <Badge
                variant={isActive ? 'default' : 'secondary'}
                className="ml-1.5 h-4 min-w-4 px-1 text-[10px]"
              >
                {group.amount}
              </Badge>
            )}
          </Button>
        );
      })}
    </div>
  );
}
