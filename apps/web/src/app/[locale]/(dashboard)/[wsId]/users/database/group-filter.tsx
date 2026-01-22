'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, MinusCircle, PlusCircle, X } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
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
  className?: string;
}

interface GroupOption {
  id: string;
  name?: string | null;
  amount?: number | null;
}

async function fetchAllGroups(wsId: string): Promise<GroupOption[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('workspace_user_groups_with_amount')
    .select('id, name, amount')
    .eq('ws_id', wsId)
    .order('name');

  if (error) throw error;
  return (data as GroupOption[]) || [];
}

async function fetchExcludedGroups(
  wsId: string,
  includedGroups: string[]
): Promise<GroupOption[]> {
  const supabase = createClient();

  if (includedGroups.length === 0) {
    return fetchAllGroups(wsId);
  }

  const { data, error } = await supabase
    .rpc('get_possible_excluded_groups', {
      _ws_id: wsId,
      included_groups: includedGroups,
    })
    .select('id, name, amount')
    .order('name');

  if (error) throw error;
  return (data as GroupOption[]) || [];
}

export function GroupFilter({
  wsId,
  filterType,
  queryKey,
  pageKey,
  dependencyKey,
  className,
}: GroupFilterProps) {
  const t = useTranslations('user-data-table');
  const [isOpen, setIsOpen] = useState(false);

  const [selectedGroupIds, setSelectedGroupIds] = useQueryState(
    queryKey,
    parseAsArrayOf(parseAsString).withDefault([]).withOptions({
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

  const filterLabel =
    filterType === 'excluded' ? t('excluded_groups') : t('included_groups');
  const hasActiveFilters = selectedGroupIds.length > 0;

  const {
    data: groups = [],
    isLoading,
    error,
  } = useQuery({
    queryKey:
      filterType === 'excluded'
        ? ['workspace-excluded-groups', wsId, dependencyGroups]
        : ['workspace-user-groups', wsId],
    queryFn: () =>
      filterType === 'excluded'
        ? fetchExcludedGroups(wsId, dependencyGroups)
        : fetchAllGroups(wsId),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: !!wsId,
  });

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

  const handleToggle = useCallback(
    async (groupId: string) => {
      const nextSelection = selectedGroupIds.includes(groupId)
        ? selectedGroupIds.filter((id) => id !== groupId)
        : [...selectedGroupIds, groupId];

      await setSelectedGroupIds(nextSelection.length > 0 ? nextSelection : []);
      await setPage('1');
    },
    [selectedGroupIds, setSelectedGroupIds, setPage]
  );

  const clearFilters = useCallback(async () => {
    await setSelectedGroupIds([]);
    await setPage('1');
  }, [setSelectedGroupIds, setPage]);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
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
                {selectedGroupIds.length}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-70 p-0" align="start">
          <Command>
            <CommandInput placeholder={t('search_groups')} />
            <CommandList>
              <CommandEmpty>
                {isLoading ? t('loading') : t('common.no_results')}
              </CommandEmpty>

              {error && (
                <CommandGroup>
                  <CommandItem disabled className="text-destructive">
                    {error instanceof Error ? error.message : t('common.error')}
                  </CommandItem>
                </CommandGroup>
              )}

              {!isLoading && !error && sortedGroups.length > 0 && (
                <CommandGroup>
                  {sortedGroups.map((group) => {
                    const isSelected = selectedGroupIds.includes(group.id);
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
