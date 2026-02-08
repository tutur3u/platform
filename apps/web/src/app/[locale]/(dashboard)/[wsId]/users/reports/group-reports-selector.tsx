'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Badge } from '@tuturuuu/ui/badge';
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
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { parseAsString, useQueryStates } from 'nuqs';
import { useEffect, useState } from 'react';
import GroupReportsClient from '../groups/[groupId]/reports/client';

interface Props {
  wsId: string;
  workspaceUserId?: string;
  hasManageUsers: boolean;
  canCheckUserAttendance: boolean;
  canApproveReports: boolean;
  canCreateReports: boolean;
  canUpdateReports: boolean;
  canDeleteReports: boolean;
}

export default function GroupReportsSelector({
  wsId,
  workspaceUserId,
  hasManageUsers,
  canCheckUserAttendance,
  canApproveReports,
  canCreateReports,
  canUpdateReports,
  canDeleteReports,
}: Props) {
  const t = useTranslations();

  const tc = useTranslations('common');

  const [open, setOpen] = useState(false);

  const [filterParams, setFilterParams] = useQueryStates(
    {
      groupId: parseAsString,
      userId: parseAsString,
      reportId: parseAsString,
    },
    { history: 'replace' }
  );

  const selectedGroupId = filterParams.groupId;

  const [query, setQuery] = useState('');
  const [debouncedQuery] = useDebounce(query, 300);

  const supabase = createClient();

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
      if (hasManageUsers) {
        let q = supabase
          .from('workspace_user_groups_with_guest')
          .select('id, name, ws_id')
          .eq('ws_id', wsId);

        if (debouncedQuery) {
          q = q.ilike('name', `%${debouncedQuery}%`);
        }

        const { data, error } = await q.order('name').limit(20);

        if (error) throw error;
        return data || [];
      }

      if (!workspaceUserId) {
        console.error(
          'Cannot search groups without workspaceUserId when lacking manage_users permission'
        );
        return [];
      }

      let q = supabase
        .from('workspace_user_groups_with_guest')
        .select('id, name, workspace_user_groups_users!inner(user_id)')
        .eq('ws_id', wsId)
        .eq('workspace_user_groups_users.user_id', workspaceUserId);

      if (debouncedQuery) {
        q = q.ilike('name', `%${debouncedQuery}%`);
      }

      const { data, error } = await q.order('name').limit(20);

      if (error) throw error;
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
      const { data, error } = await supabase
        .from('workspace_user_groups_with_guest')
        .select('name')
        .eq('id', selectedGroupId)
        .single();

      if (error) return null;
      return data;
    },
    enabled: !!selectedGroupId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  const groups = searchGroupsQuery.data ?? [];
  const selectedGroup = selectedGroupQuery.data;

  // Query to fetch all group managers (teachers) for the selected group
  const groupManagersQuery = useQuery({
    queryKey: ['ws', wsId, 'group', selectedGroupId, 'managers'],
    enabled: Boolean(selectedGroupId),
    queryFn: async (): Promise<
      Array<{ id: string; full_name: string | null }>
    > => {
      const { data, error } = await supabase
        .from('workspace_user_groups_users')
        .select('user:workspace_users!inner(id, full_name, ws_id)')
        .eq('group_id', selectedGroupId!)
        .eq('role', 'TEACHER')
        .eq('user.ws_id', wsId);
      if (error) throw error;
      const rows = (data ?? []) as Array<{ user: any }>;
      const managers: Array<{ id: string; full_name: string | null }> = [];
      for (const row of rows) {
        const u = row?.user;
        if (Array.isArray(u)) {
          const first = u[0];
          if (first)
            managers.push({ id: first.id, full_name: first.full_name ?? null });
        } else if (u) {
          managers.push({ id: u.id, full_name: u.full_name ?? null });
        }
      }
      return managers;
    },
  });

  // Auto-select first group when groups load and none is selected
  useEffect(() => {
    if (!selectedGroupId && groups.length > 0 && groups[0]?.id) {
      setFilterParams({
        groupId: groups[0].id,
        userId: null,
        reportId: null,
      });
    }
  }, [selectedGroupId, groups, setFilterParams]);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex flex-col gap-2">
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
                            setFilterParams({
                              groupId: group.id,
                              userId: null,
                              reportId: null,
                            });
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

          {groupManagersQuery.data && groupManagersQuery.data.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground text-sm">
                {t('ws-user-groups.managers')}:
              </span>
              {groupManagersQuery.data.map((manager) => (
                <Link
                  key={manager.id}
                  href={`/${wsId}/users/database/${manager.id}`}
                >
                  <Badge variant="secondary" className="hover:bg-secondary/80">
                    {manager.full_name}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedGroupId && selectedGroup && (
        <>
          <Separator />
          <GroupReportsClient
            wsId={wsId}
            groupId={selectedGroupId}
            groupNameFallback={selectedGroup.name || ''}
            canCheckUserAttendance={canCheckUserAttendance}
            canApproveReports={canApproveReports}
            canCreateReports={canCreateReports}
            canUpdateReports={canUpdateReports}
            canDeleteReports={canDeleteReports}
          />
        </>
      )}
    </div>
  );
}
