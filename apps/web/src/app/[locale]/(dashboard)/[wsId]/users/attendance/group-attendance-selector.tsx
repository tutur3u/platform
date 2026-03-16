'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown } from '@tuturuuu/icons';
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
import { useState } from 'react';
import GroupAttendanceClient from '../groups/[groupId]/attendance/client';

type Member = {
  id: string;
  display_name?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
};

interface Props {
  wsId: string;
  workspaceUserId?: string;
  hasManageUsers: boolean;
  canUpdateAttendance: boolean;
}

export default function GroupAttendanceSelector({
  wsId,
  workspaceUserId,
  hasManageUsers,
  canUpdateAttendance,
}: Props) {
  const t = useTranslations();
  const tc = useTranslations('common');

  const [open, setOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [debouncedQuery] = useDebounce(query, 300);

  // Search groups (only active when searching)
  const searchGroupsQuery = useQuery({
    queryKey: [
      'user-groups-search-attendance',
      wsId,
      workspaceUserId,
      hasManageUsers,
      debouncedQuery,
    ],
    queryFn: async () => {
      if (!debouncedQuery) return [];

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
    enabled:
      !!wsId &&
      (hasManageUsers || !!workspaceUserId) &&
      debouncedQuery.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch selected group details (to display correct name even if not in search results)
  const selectedGroupQuery = useQuery({
    queryKey: ['selected-group-details-attendance', selectedGroupId],
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
  const selectedGroup = selectedGroupQuery.data;

  // Fetch group sessions when a group is selected
  const { data: groupData, isLoading: isLoadingSessions } = useQuery({
    queryKey: [
      'workspaces',
      wsId,
      'users',
      'groups',
      selectedGroupId,
      'sessions',
    ],
    queryFn: async () => {
      if (!selectedGroupId) return null;
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/user-groups/${selectedGroupId}`,
        { cache: 'no-store' }
      );
      if (!res.ok) throw new Error('Failed to fetch group details');
      const { data } = await res.json();
      return {
        sessions: Array.isArray(data?.sessions)
          ? (data.sessions as string[])
          : [],
        startingDate: (data?.starting_date ?? null) as string | null,
        endingDate: (data?.ending_date ?? null) as string | null,
      };
    },
    enabled: !!selectedGroupId,
    staleTime: 60 * 1000,
  });

  // Fetch members
  const { data: members = [], isLoading: isLoadingMembers } = useQuery<
    Member[]
  >({
    queryKey: [
      'workspaces',
      wsId,
      'users',
      'groups',
      selectedGroupId,
      'members',
    ],
    queryFn: async () => {
      if (!selectedGroupId) return [];
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/user-groups/${selectedGroupId}/members?limit=1000`,
        { cache: 'no-store' }
      );
      if (!res.ok) throw new Error('Failed to fetch group members');
      const { data } = await res.json();
      return data || [];
    },
    enabled: !!selectedGroupId,
    staleTime: 60 * 1000,
  });

  const isLoadingData = isLoadingSessions || isLoadingMembers;

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
                          setSelectedGroupId(group.id);
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
                  <CommandEmpty>
                    {query
                      ? tc('no_results_found')
                      : t('ws-user-groups.search_group_placeholder')}
                  </CommandEmpty>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Attendance Manager */}
      {selectedGroupId && selectedGroup && (
        <>
          <Separator />
          {isLoadingData ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            <GroupAttendanceClient
              wsId={wsId}
              groupId={selectedGroupId}
              initialSessions={groupData?.sessions ?? []}
              initialMembers={members}
              canUpdateAttendance={canUpdateAttendance}
              startingDate={groupData?.startingDate ?? null}
              endingDate={groupData?.endingDate ?? null}
            />
          )}
        </>
      )}
    </div>
  );
}
