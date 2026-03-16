'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown } from '@tuturuuu/icons';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Button } from '@tuturuuu/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@tuturuuu/ui/command';
import { useDebounce } from '@tuturuuu/ui/hooks/use-debounce';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { Separator } from '@tuturuuu/ui/separator';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { parseAsString, useQueryStates } from 'nuqs';
import { useEffect, useState } from 'react';
import GroupIndicatorsManager from '../[groupId]/indicators/group-indicators-manager';

interface Props {
  wsId: string;
  workspaceUserId?: string;
  hasManageUsers: boolean;
  canCreateUserGroupsScores: boolean;
  canUpdateUserGroupsScores: boolean;
  canDeleteUserGroupsScores: boolean;
}

export default function GroupIndicatorsSelector({
  wsId,
  workspaceUserId,
  hasManageUsers,
  canCreateUserGroupsScores,
  canUpdateUserGroupsScores,
  canDeleteUserGroupsScores,
}: Props) {
  const t = useTranslations();
  const tc = useTranslations('common');

  const [open, setOpen] = useState(false);

  const [filterParams, setFilterParams] = useQueryStates(
    {
      groupId: parseAsString,
    },
    { history: 'replace' }
  );

  const selectedGroupId = filterParams.groupId;

  const [query, setQuery] = useState('');
  const [debouncedQuery] = useDebounce(query, 300);

  // Search groups (only active when searching)
  const searchGroupsQuery = useQuery({
    queryKey: [
      'user-groups-search',
      wsId,
      workspaceUserId,
      hasManageUsers,
      debouncedQuery,
    ],
    queryFn: async () => {
      const searchParams = new URLSearchParams({
        q: debouncedQuery,
        limit: '20',
      });
      if (workspaceUserId && !hasManageUsers) {
        searchParams.set('userId', workspaceUserId);
      }

      const res = await fetch(
        `/api/v1/workspaces/${wsId}/users/groups?${searchParams.toString()}`,
        { cache: 'no-store' }
      );
      if (!res.ok) throw new Error('Failed to fetch groups');
      const { data } = await res.json();
      return data || [];
    },
    enabled: !!wsId && (hasManageUsers || !!workspaceUserId),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch selected group details (to display correct name even if not in search results)
  const selectedGroupQuery = useQuery({
    queryKey: ['selected-group-details', selectedGroupId],
    queryFn: async () => {
      if (!selectedGroupId) return null;
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/user-groups/${selectedGroupId}`,
        { cache: 'no-store' }
      );
      if (!res.ok) return null;
      const { data } = await res.json();
      return data;
    },
    enabled: !!selectedGroupId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  const groups = (searchGroupsQuery.data || []) as Array<{
    id: string;
    name: string | null;
  }>;
  const selectedGroup = selectedGroupQuery.data as unknown as {
    name: string | null;
  };

  // Auto-select first group when groups load and none is selected
  useEffect(() => {
    if (!selectedGroupId && groups.length > 0 && groups[0]?.id) {
      setFilterParams({ groupId: groups[0].id });
    }
  }, [selectedGroupId, groups, setFilterParams]);

  // Fetch indicators and users
  const indicatorsDataQuery = useQuery({
    queryKey: ['group-indicators-data-selector', wsId, selectedGroupId],
    queryFn: async () => {
      if (!selectedGroupId) return null;
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/user-groups/${selectedGroupId}/indicators`,
        { cache: 'no-store' }
      );
      if (!res.ok) throw new Error('Failed to fetch indicators');
      return await res.json();
    },
    enabled: !!selectedGroupId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const groupIndicators = indicatorsDataQuery.data?.groupIndicators || [];
  const userIndicators = indicatorsDataQuery.data?.userIndicators || [];

  // Fetch users
  const usersQuery = useQuery({
    queryKey: ['group-users-selector', wsId, selectedGroupId],
    queryFn: async (): Promise<WorkspaceUser[]> => {
      if (!selectedGroupId) return [];

      const res = await fetch(
        `/api/v1/workspaces/${wsId}/user-groups/${selectedGroupId}/members?limit=1000`,
        { cache: 'no-store' }
      );
      if (!res.ok) throw new Error('Failed to fetch users');
      const { data } = await res.json();
      return data || [];
    },
    enabled: !!selectedGroupId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const users = usersQuery.data || [];

  const isLoadingData = indicatorsDataQuery.isLoading || usersQuery.isLoading;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-full max-w-sm justify-between"
            >
              {selectedGroup
                ? selectedGroup.name
                : t('ws-user-groups.select_group_placeholder')}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-100 max-w-(--radix-popover-trigger-width) p-0">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder={t('ws-user-groups.select_group_placeholder')}
                value={query}
                onValueChange={setQuery}
              />
              <CommandList>
                {searchGroupsQuery.isLoading ? (
                  <div className="py-6 text-center text-muted-foreground text-sm">
                    {tc('loading')}
                  </div>
                ) : groups.length > 0 ? (
                  <CommandGroup>
                    {groups.map((group) => (
                      <CommandItem
                        key={group.id}
                        value={group.name || ''}
                        onSelect={() => {
                          setFilterParams({ groupId: group.id });
                          setOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            selectedGroupId === group.id
                              ? 'opacity-100'
                              : 'opacity-0'
                          )}
                        />
                        {group.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : (
                  <CommandEmpty>{tc('no_results_found')}</CommandEmpty>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Indicators Manager */}
      {selectedGroupId && selectedGroup && (
        <>
          <Separator />
          {isLoadingData ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            <GroupIndicatorsManager
              wsId={wsId}
              groupId={selectedGroupId}
              groupName={selectedGroup.name || ''}
              users={users}
              initialGroupIndicators={groupIndicators}
              initialUserIndicators={userIndicators}
              canCreateUserGroupsScores={canCreateUserGroupsScores}
              canUpdateUserGroupsScores={canUpdateUserGroupsScores}
              canDeleteUserGroupsScores={canDeleteUserGroupsScores}
            />
          )}
        </>
      )}
    </div>
  );
}
