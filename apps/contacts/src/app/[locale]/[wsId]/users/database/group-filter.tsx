'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Check, MinusCircle, PlusCircle, X } from '@tuturuuu/icons';
import {
  getNextWorkspaceUserGroupsPageParam,
  listWorkspaceUserGroups,
  listWorkspaceUserGroupsByIds,
} from '@tuturuuu/internal-api/user-groups';
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
import { fetchPossibleExcludedGroupsPage } from '@tuturuuu/users-ui/database/hooks';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';

interface GroupFilterProps {
  wsId: string;
  filterType: 'included' | 'excluded';
  selectedGroupIds: string[];
  dependencyGroupIds: string[];
  effectiveSelectedGroupIds?: string[];
  onSelectedGroupIdsChange?: (value: string[]) => Promise<void> | void;
  className?: string;
}

interface GroupOption {
  id: string;
  name?: string | null;
  amount?: number | null;
}

interface GroupsPageResponse {
  count: number;
  data: GroupOption[];
  pageSize: number;
}

const GROUPS_PAGE_SIZE = 50;

async function fetchGroupsByIds(
  wsId: string,
  groupIds: string[]
): Promise<GroupOption[]> {
  return listWorkspaceUserGroupsByIds(wsId, groupIds);
}

async function fetchIncludedGroupsPage(
  wsId: string,
  page: number,
  query: string
): Promise<GroupsPageResponse> {
  return listWorkspaceUserGroups(wsId, {
    page,
    pageSize: GROUPS_PAGE_SIZE,
    q: query.trim() || undefined,
  });
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

  const payload = await fetchPossibleExcludedGroupsPage(wsId, {
    includedGroups,
    page,
    pageSize: GROUPS_PAGE_SIZE,
    paginated: true,
    q: query.trim() || undefined,
  });

  return {
    count: payload.count ?? 0,
    data: payload.data ?? [],
    pageSize: GROUPS_PAGE_SIZE,
  };
}

export function GroupFilter({
  wsId,
  filterType,
  selectedGroupIds,
  dependencyGroupIds,
  effectiveSelectedGroupIds = [],
  onSelectedGroupIdsChange,
  className,
}: GroupFilterProps) {
  const t = useTranslations('user-data-table');
  const commonT = useTranslations('common');
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const resolvedSelectedGroupIds =
    selectedGroupIds.length > 0 ? selectedGroupIds : effectiveSelectedGroupIds;
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
            dependencyGroupIds,
            searchQuery.trim(),
          ]
        : ['workspace-user-groups-infinite', wsId, searchQuery.trim()],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      filterType === 'excluded'
        ? fetchExcludedGroupsPage(
            wsId,
            dependencyGroupIds,
            pageParam,
            searchQuery
          )
        : fetchIncludedGroupsPage(wsId, pageParam, searchQuery),
    getNextPageParam: getNextWorkspaceUserGroupsPageParam,
    enabled: !!wsId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
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
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
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
    const selectedSet = new Set(resolvedSelectedGroupIds);
    return [...groups].sort((a, b) => {
      const aSelected = selectedSet.has(a.id);
      const bSelected = selectedSet.has(b.id);
      if (aSelected && !bSelected) return -1;
      if (!aSelected && bSelected) return 1;
      const aName = a.name || t('common.unknown');
      const bName = b.name || t('common.unknown');
      return aName.localeCompare(bName);
    });
  }, [groups, resolvedSelectedGroupIds, t]);

  const combinedError = error || selectedGroupsError;
  const showInitialLoading = isLoading || isLoadingSelectedGroups;

  const handleToggle = useCallback(
    async (groupId: string) => {
      const currentSelection = resolvedSelectedGroupIds;
      const nextSelection = currentSelection.includes(groupId)
        ? currentSelection.filter((id) => id !== groupId)
        : [...currentSelection, groupId];

      await onSelectedGroupIdsChange?.(nextSelection);
    },
    [onSelectedGroupIdsChange, resolvedSelectedGroupIds]
  );

  const clearFilters = useCallback(async () => {
    await onSelectedGroupIdsChange?.([]);
  }, [onSelectedGroupIdsChange]);

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
            className="h-9 gap-2 rounded-xl px-3"
          >
            {filterType === 'excluded' ? (
              <MinusCircle className="h-3 w-3" />
            ) : (
              <PlusCircle className="h-3 w-3" />
            )}
            <span className="text-xs">{filterLabel}</span>
            {hasActiveFilters && (
              <span className="ml-1 rounded-full bg-background/70 px-1.5 font-semibold text-[10px] text-foreground">
                {resolvedSelectedGroupIds.length}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[18rem] p-0 sm:w-80" align="start">
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
