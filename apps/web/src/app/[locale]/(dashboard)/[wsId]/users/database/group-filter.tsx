'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Check, MinusCircle, PlusCircle, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@tuturuuu/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { parseAsArrayOf, parseAsString, useQueryState } from 'nuqs';
import { useCallback, useMemo, useState } from 'react';

interface GroupFilterProps {
  wsId: string;
  filterType: 'included' | 'excluded';
  queryKey: 'includedGroups' | 'excludedGroups';
  pageKey: 'page';
  dependencyKey?: 'includedGroups';
  effectiveSelectedGroupIds?: string[];
  className?: string;
}

interface GroupOption {
  id: string;
  name?: string | null;
  amount?: number | null;
}

interface GroupsPageResponse {
  data: GroupOption[];
  count: number;
}

const GROUPS_PAGE_SIZE = 50;

async function fetchGroupsByIds(
  wsId: string,
  groupIds: string[]
): Promise<GroupOption[]> {
  if (groupIds.length === 0) {
    return [];
  }

  const searchParams = new URLSearchParams();
  searchParams.set('ids', groupIds.join(','));
  searchParams.set('page', '1');
  searchParams.set('pageSize', String(Math.max(groupIds.length, 1)));

  const response = await fetch(
    `/api/v1/workspaces/${wsId}/users/groups?${searchParams.toString()}`,
    { cache: 'no-store' }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch selected workspace user groups');
  }

  const payload = (await response.json()) as {
    data?: GroupOption[];
  };

  return payload.data ?? [];
}

async function fetchIncludedGroupsPage(
  wsId: string,
  page: number,
  query: string
): Promise<GroupsPageResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set('page', String(page));
  searchParams.set('pageSize', String(GROUPS_PAGE_SIZE));

  if (query.trim()) {
    searchParams.set('q', query.trim());
  }

  const response = await fetch(
    `/api/v1/workspaces/${wsId}/users/groups?${searchParams.toString()}`,
    {
      cache: 'no-store',
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch workspace user groups');
  }

  const payload = (await response.json()) as GroupsPageResponse;
  return {
    data: payload.data ?? [],
    count: payload.count ?? 0,
  };
}

async function fetchExcludedGroupsPage(
  wsId: string,
  includedGroups: string[],
  page: number,
  query: string
): Promise<GroupsPageResponse> {
  if (includedGroups.length === 0) {
    return fetchIncludedGroupsPage(wsId, page, query);
  }

  const searchParams = new URLSearchParams();
  searchParams.set('page', String(page));
  searchParams.set('pageSize', String(GROUPS_PAGE_SIZE));
  searchParams.set('paginated', 'true');

  if (query.trim()) {
    searchParams.set('q', query.trim());
  }

  includedGroups.forEach((group) => {
    searchParams.append('includedGroups', group);
  });

  const response = await fetch(
    `/api/v1/workspaces/${wsId}/users/groups/possible-excluded?${searchParams.toString()}`,
    { cache: 'no-store' }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch possible excluded groups');
  }

  const payload = (await response.json()) as GroupsPageResponse;
  return {
    data: payload.data ?? [],
    count: payload.count ?? 0,
  };
}

export function GroupFilter({
  wsId,
  filterType,
  queryKey,
  pageKey,
  dependencyKey,
  effectiveSelectedGroupIds = [],
  className,
}: GroupFilterProps) {
  const t = useTranslations('user-data-table');
  const commonT = useTranslations('common');
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedGroupIds, setSelectedGroupIds] = useQueryState(
    queryKey,
    queryKey === 'excludedGroups'
      ? parseAsArrayOf(parseAsString).withOptions({
          shallow: true,
        })
      : parseAsArrayOf(parseAsString).withDefault([]).withOptions({
          shallow: true,
        })
  );
  const [dependencyGroups] = useQueryState(
    dependencyKey ?? 'includedGroups',
    parseAsArrayOf(parseAsString).withDefault([]).withOptions({
      shallow: true,
    })
  );
  const [, setPage] = useQueryState(pageKey, { shallow: true });

  const resolvedSelectedGroupIds =
    selectedGroupIds ?? effectiveSelectedGroupIds;
  const normalizedSelectedGroupIds = useMemo(
    () => [...new Set(resolvedSelectedGroupIds.filter(Boolean))],
    [resolvedSelectedGroupIds]
  );

  const filterLabel =
    filterType === 'excluded' ? t('excluded_groups') : t('included_groups');
  const hasActiveFilters = resolvedSelectedGroupIds.length > 0;

  const {
    data: pagedGroups,
    isLoading,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey:
      filterType === 'excluded'
        ? [
            'workspace-excluded-groups-infinite',
            wsId,
            dependencyGroups,
            searchQuery.trim(),
          ]
        : ['workspace-user-groups-infinite', wsId, searchQuery.trim()],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      filterType === 'excluded'
        ? fetchExcludedGroupsPage(
            wsId,
            dependencyGroups,
            pageParam,
            searchQuery
          )
        : fetchIncludedGroupsPage(wsId, pageParam, searchQuery),
    getNextPageParam: (lastPage, allPages) => {
      const loadedCount = allPages.reduce(
        (total, currentPage) => total + currentPage.data.length,
        0
      );

      if (loadedCount >= lastPage.count) {
        return undefined;
      }

      return allPages.length + 1;
    },
    enabled: !!wsId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const {
    data: selectedGroups = [],
    isLoading: isLoadingSelectedGroups,
    error: selectedGroupsError,
  } = useQuery({
    queryKey: [
      'workspace-user-groups-selected',
      wsId,
      normalizedSelectedGroupIds,
    ],
    queryFn: () => fetchGroupsByIds(wsId, normalizedSelectedGroupIds),
    enabled: !!wsId && normalizedSelectedGroupIds.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const groups = useMemo(() => {
    const mergedGroups = new Map<string, GroupOption>();

    selectedGroups.forEach((group) => {
      mergedGroups.set(group.id, group);
    });

    (pagedGroups?.pages ?? []).forEach((currentPage) => {
      currentPage.data.forEach((group) => {
        mergedGroups.set(group.id, group);
      });
    });

    return [...mergedGroups.values()];
  }, [pagedGroups?.pages, selectedGroups]);

  const sortedGroups = useMemo(() => {
    const selectedSet = new Set(selectedGroupIds);
    return [...groups].sort((a, b) => {
      const aSelected = selectedSet.has(a.id);
      const bSelected = selectedSet.has(b.id);
      if (aSelected && !bSelected) return -1;
      if (!aSelected && bSelected) return 1;
      const aName = a.name || t('common.unknown');
      const bName = b.name || t('common.unknown');
      return aName.localeCompare(bName);
    });
  }, [groups, selectedGroupIds, t]);

  const combinedError = error || selectedGroupsError;
  const showInitialLoading = isLoading || isLoadingSelectedGroups;

  const handleToggle = useCallback(
    async (groupId: string) => {
      const currentSelection = resolvedSelectedGroupIds;
      const nextSelection = currentSelection.includes(groupId)
        ? currentSelection.filter((id) => id !== groupId)
        : [...currentSelection, groupId];

      await setSelectedGroupIds(
        nextSelection.length > 0
          ? nextSelection
          : queryKey === 'excludedGroups'
            ? null
            : []
      );
      await setPage('1');
    },
    [queryKey, resolvedSelectedGroupIds, setSelectedGroupIds, setPage]
  );

  const clearFilters = useCallback(async () => {
    await setSelectedGroupIds(queryKey === 'excludedGroups' ? null : []);
    await setPage('1');
  }, [queryKey, setSelectedGroupIds, setPage]);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Popover
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) {
            setSearchQuery('');
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant={hasActiveFilters ? 'secondary' : 'outline'}
            size="sm"
            className="h-8 gap-1.5"
          >
            {filterType === 'excluded' ? (
              <MinusCircle className="h-3 w-3" />
            ) : (
              <PlusCircle className="h-3 w-3" />
            )}
            <span className="text-xs">{filterLabel}</span>
            {hasActiveFilters && (
              <span className="ml-1 rounded-full bg-background/60 px-1.5 font-semibold text-[10px] text-foreground">
                {resolvedSelectedGroupIds.length}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-70 p-0" align="start">
          <Command>
            <CommandInput
              placeholder={t('search_groups')}
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
            <CommandList
              onScroll={(event) => {
                if (!hasNextPage || isFetchingNextPage) return;

                const element = event.currentTarget;
                const remainingScrollDistance =
                  element.scrollHeight -
                  element.scrollTop -
                  element.clientHeight;

                if (remainingScrollDistance <= 48) {
                  void fetchNextPage();
                }
              }}
            >
              <CommandEmpty>
                {showInitialLoading ? t('loading') : t('common.no_results')}
              </CommandEmpty>

              {combinedError && (
                <CommandGroup>
                  <CommandItem disabled className="text-destructive">
                    {combinedError instanceof Error
                      ? combinedError.message
                      : t('common.error')}
                  </CommandItem>
                </CommandGroup>
              )}

              {!showInitialLoading &&
                !combinedError &&
                sortedGroups.length > 0 && (
                  <CommandGroup>
                    {sortedGroups.map((group) => {
                      const isSelected = resolvedSelectedGroupIds.includes(
                        group.id
                      );
                      const label = group.name || t('common.unknown');

                      return (
                        <CommandItem
                          key={group.id}
                          onSelect={() => handleToggle(group.id)}
                          className="flex cursor-pointer items-center gap-2"
                        >
                          <div
                            className={cn(
                              'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                              isSelected
                                ? 'bg-primary text-primary-foreground'
                                : 'opacity-50 [&_svg]:invisible'
                            )}
                          >
                            <Check className="h-4 w-4" />
                          </div>
                          <div className="flex flex-1 flex-col">
                            <span className="font-medium text-sm">{label}</span>
                          </div>
                          {typeof group.amount === 'number' && (
                            <span className="text-muted-foreground text-xs">
                              {group.amount}
                            </span>
                          )}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                )}

              {hasNextPage && !combinedError && !showInitialLoading && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      value="__group_filter_load_more__"
                      onSelect={() => void fetchNextPage()}
                      className="justify-center text-center font-medium text-primary"
                    >
                      {commonT('load_more')}
                    </CommandItem>
                  </CommandGroup>
                </>
              )}

              {isFetchingNextPage && (
                <>
                  <CommandSeparator />
                  <div className="px-2 py-2 text-center text-muted-foreground text-xs">
                    {commonT('loading')}
                  </div>
                </>
              )}

              {hasActiveFilters && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      onSelect={clearFilters}
                      className="cursor-pointer justify-center text-center text-destructive"
                    >
                      <X className="mr-2 h-4 w-4" />
                      {t('clear_selection')}
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
