'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { CalendarDays, Check, ChevronsUpDown, Users } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
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
import { useEffect, useMemo, useState } from 'react';
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

interface GroupOption {
  id: string;
  name: string | null;
}

interface GroupsPageResponse {
  data?: GroupOption[];
  count?: number;
}

const GROUPS_PAGE_SIZE = 50;

async function fetchGroupsPage({
  wsId,
  query,
  page,
  workspaceUserId,
  hasManageUsers,
}: {
  wsId: string;
  query: string;
  page: number;
  workspaceUserId?: string;
  hasManageUsers: boolean;
}): Promise<Required<GroupsPageResponse>> {
  const searchParams = new URLSearchParams({
    page: String(page),
    pageSize: String(GROUPS_PAGE_SIZE),
  });

  if (query.trim()) {
    searchParams.set('q', query.trim());
  }

  if (workspaceUserId && !hasManageUsers) {
    searchParams.set('userId', workspaceUserId);
  }

  const res = await fetch(
    `/api/v1/workspaces/${wsId}/users/groups?${searchParams.toString()}`,
    { cache: 'no-store' }
  );

  if (!res.ok) {
    throw new Error('Failed to fetch groups');
  }

  const payload = (await res.json()) as GroupsPageResponse;

  return {
    data: payload.data ?? [],
    count: payload.count ?? 0,
  };
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

  const groupsQuery = useInfiniteQuery({
    queryKey: [
      'user-groups-attendance',
      wsId,
      workspaceUserId,
      hasManageUsers,
      debouncedQuery,
    ],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      fetchGroupsPage({
        wsId,
        query: debouncedQuery,
        page: pageParam,
        workspaceUserId,
        hasManageUsers,
      }),
    getNextPageParam: (lastPage, allPages) => {
      const loadedCount = allPages.reduce(
        (total, page) => total + page.data.length,
        0
      );

      if (loadedCount >= lastPage.count) {
        return undefined;
      }

      return allPages.length + 1;
    },
    enabled: !!wsId && (hasManageUsers || !!workspaceUserId),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch selected group details (to display correct name even if not in search results)
  const selectedGroupQuery = useQuery({
    queryKey: ['selected-group-details-attendance', wsId, selectedGroupId],
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

  const groups = useMemo(
    () => (groupsQuery.data?.pages ?? []).flatMap((page) => page.data),
    [groupsQuery.data?.pages]
  );
  const selectedGroup =
    groups.find((group) => group.id === selectedGroupId) ??
    selectedGroupQuery.data;

  useEffect(() => {
    if (!selectedGroupId && groups[0]?.id) {
      setSelectedGroupId(groups[0].id);
    }
  }, [groups, selectedGroupId]);

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
  const selectedGroupSessions = groupData?.sessions?.length ?? 0;
  const selectedGroupMembers = members.length;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-primary/10 bg-linear-to-br from-primary/5 via-background to-background">
        <CardHeader className="gap-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle>{t('ws-user-attendance.selector_title')}</CardTitle>
              <CardDescription>
                {t('ws-user-attendance.selector_description')}
              </CardDescription>
            </div>
            {selectedGroup && (
              <Badge variant="secondary" className="max-w-full truncate">
                {t('ws-user-attendance.selected_group_label', {
                  name: selectedGroup.name,
                })}
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="h-11 w-full justify-between rounded-xl bg-background/80"
              >
                <span className="truncate">
                  {selectedGroup
                    ? selectedGroup.name
                    : t('ws-user-groups.select_group_placeholder')}
                </span>
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
                <CommandList
                  onScroll={(event) => {
                    if (
                      !groupsQuery.hasNextPage ||
                      groupsQuery.isFetchingNextPage
                    )
                      return;

                    const element = event.currentTarget;
                    const remainingScrollDistance =
                      element.scrollHeight -
                      element.scrollTop -
                      element.clientHeight;

                    if (remainingScrollDistance <= 48) {
                      void groupsQuery.fetchNextPage();
                    }
                  }}
                >
                  {groupsQuery.isLoading ? (
                    <div className="py-6 text-center text-muted-foreground text-sm">
                      {tc('loading')}
                    </div>
                  ) : groups.length > 0 ? (
                    <>
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
                      {groupsQuery.isFetchingNextPage && (
                        <div className="px-2 py-2 text-center text-muted-foreground text-xs">
                          {tc('loading')}
                        </div>
                      )}
                    </>
                  ) : (
                    <CommandEmpty>
                      {query
                        ? tc('no_results_found')
                        : t('ws-user-groups.search_group_placeholder')}
                    </CommandEmpty>
                  )}
                  {groupsQuery.isError && (
                    <div className="px-2 py-2 text-center text-destructive text-sm">
                      {groupsQuery.error instanceof Error
                        ? groupsQuery.error.message
                        : tc('error')}
                    </div>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <div className="flex flex-wrap gap-2 text-muted-foreground text-sm">
            <Badge variant="outline" className="gap-1.5 rounded-full">
              <CalendarDays className="h-3.5 w-3.5" />
              {t('ws-user-attendance.group_scope_badge')}
            </Badge>
            {selectedGroup && !isLoadingData && (
              <>
                <Badge variant="outline" className="gap-1.5 rounded-full">
                  <Users className="h-3.5 w-3.5" />
                  {t('ws-user-attendance.members_badge', {
                    count: selectedGroupMembers,
                  })}
                </Badge>
                <Badge variant="outline" className="rounded-full">
                  {t('ws-user-attendance.sessions_badge', {
                    count: selectedGroupSessions,
                  })}
                </Badge>
              </>
            )}
          </div>
        </CardContent>
      </Card>

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
