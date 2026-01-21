'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
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
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import GroupReportsClient from '../groups/[groupId]/reports/client';

interface Props {
  wsId: string;
  workspaceUserId?: string;
  hasManageUsers: boolean;
  canCheckUserAttendance: boolean;
  canCreateReports: boolean;
  canUpdateReports: boolean;
  canDeleteReports: boolean;
  initialUserId?: string;
  initialReportId?: string;
}

export default function GroupReportsSelector({
  wsId,
  workspaceUserId,
  hasManageUsers,
  canCheckUserAttendance,
  canCreateReports,
  canUpdateReports,
  canDeleteReports,
  initialUserId,
  initialReportId,
}: Props) {
  const t = useTranslations();
  const tc = useTranslations('common');

  const [open, setOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

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
      if (!debouncedQuery) return [];

      if (hasManageUsers) {
        const { data, error } = await supabase
          .from('workspace_user_groups_with_guest')
          .select('id, name, ws_id')
          .eq('ws_id', wsId)
          .ilike('name', `%${debouncedQuery}%`)
          .order('name')
          .limit(20);

        if (error) throw error;
        return data || [];
      }

      if (!workspaceUserId) {
        console.error(
          'Cannot search groups without workspaceUserId when lacking manage_users permission'
        );
        return [];
      }

      const { data, error } = await supabase
        .from('workspace_user_groups_with_guest')
        .select('id, name, workspace_user_groups_users!inner(user_id)')
        .eq('ws_id', wsId)
        .eq('workspace_user_groups_users.user_id', workspaceUserId)
        .ilike('name', `%${debouncedQuery}%`)
        .order('name')
        .limit(20);

      if (error) throw error;
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

      {selectedGroupId && selectedGroup && (
        <>
          <Separator />
          <GroupReportsClient
            wsId={wsId}
            groupId={selectedGroupId}
            initialUserId={initialUserId}
            initialReportId={initialReportId}
            groupNameFallback={selectedGroup.name || ''}
            canCheckUserAttendance={canCheckUserAttendance}
            canCreateReports={canCreateReports}
            canUpdateReports={canUpdateReports}
            canDeleteReports={canDeleteReports}
          />
        </>
      )}
    </div>
  );
}
