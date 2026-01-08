'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@tuturuuu/ui/popover';
import { Separator } from '@tuturuuu/ui/separator';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { Check, ChevronsUpDown } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { cn } from '@tuturuuu/utils/format';
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
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  
  const [query, setQuery] = useState('');
  const [debouncedQuery] = useDebounce(query, 300);

  const supabase = createClient();

  // Search groups (only active when searching)
  const searchGroupsQuery = useQuery<UserGroup[]>({
    queryKey: ['user-groups-search', wsId, workspaceUserId, hasManageUsers, debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery) return [];

      if (hasManageUsers) {
        const { data, error } = await supabase
          .from('workspace_user_groups_with_guest')
          .select(
            'id, ws_id, name, starting_date, ending_date, archived, notes, is_guest, amount, created_at'
          )
          .eq('ws_id', wsId)
          .ilike('name', `%${debouncedQuery}%`)
          .order('name')
          .limit(20);

        if (error) throw error;
        return (data || []) as UserGroup[];
      } 
      
      if (!workspaceUserId) return [];

      const { data: members, error: memberError } = await supabase
        .from('workspace_user_groups_users')
        .select('group_id')
        .eq('user_id', workspaceUserId);
        
      if (memberError) throw memberError;
      
      const groupIds = members?.map((m) => m.group_id).filter(Boolean) as string[];
      
      if (!groupIds.length) return [];

      const { data, error } = await supabase
        .from('workspace_user_groups_with_guest')
        .select(
          'id, ws_id, name, starting_date, ending_date, archived, notes, is_guest, amount, created_at'
        )
        .eq('ws_id', wsId)
        .in('id', groupIds)
        .ilike('name', `%${debouncedQuery}%`)
        .order('name')
        .limit(20);

      if (error) throw error;
      return (data || []) as UserGroup[];
    },
    enabled: !!wsId && (hasManageUsers || !!workspaceUserId) && debouncedQuery.length > 0,
  });

  // Fetch selected group details (to display correct name even if not in search results)
  const selectedGroupQuery = useQuery({
    queryKey: ['selected-group-details', selectedGroupId],
    queryFn: async () => {
      if (!selectedGroupId) return null;
      const { data, error } = await supabase
        .from('workspace_user_groups_with_guest')
        .select('*')
        .eq('id', selectedGroupId)
        .single();
      
      if (error) return null;
      return data as UserGroup;
    },
    enabled: !!selectedGroupId,
  });

  const groups = searchGroupsQuery.data ?? [];
  const selectedGroup = selectedGroupQuery.data;

  // Fetch group indicators
  const { data: groupIndicators = [], isLoading: isLoadingIndicators } =
    useQuery({
      queryKey: ['groupIndicators', wsId, selectedGroupId],
      queryFn: async () => {
        if (!selectedGroupId) return [];

        const { data, error } = await supabase
          .from('healthcare_vitals')
          .select('id, name, factor, unit')
          .eq('group_id', selectedGroupId)
          .order('created_at', { ascending: true });

        if (error) throw error;
        return data || [];
      },
      enabled: !!selectedGroupId,
    });

  // Fetch user indicators
  const { data: userIndicators = [], isLoading: isLoadingUserIndicators } =
    useQuery({
      queryKey: ['userIndicators', wsId, selectedGroupId],
      queryFn: async () => {
        if (!selectedGroupId) return [];

        const { data, error } = await supabase
          .from('user_indicators')
          .select(
            `
            user_id, 
            indicator_id, 
            value,
            healthcare_vitals!inner(group_id)
          `
          )
          .eq('healthcare_vitals.group_id', selectedGroupId);

        if (error) throw error;
        return (data || []).map((d) => ({
          user_id: d.user_id,
          indicator_id: d.indicator_id,
          value: d.value,
        }));
      },
      enabled: !!selectedGroupId,
    });

  // Fetch users
  const { data: users = [], isLoading: isLoadingUsers } = useQuery({
    queryKey: ['group-users', wsId, selectedGroupId],
    queryFn: async (): Promise<WorkspaceUser[]> => {
      if (!selectedGroupId) return [];

      const { data, error } = await supabase
        .rpc('get_workspace_users', {
          _ws_id: wsId,
          included_groups: [selectedGroupId],
          excluded_groups: [],
          search_query: '',
        })
        .select('*')
        .order('full_name', { ascending: true, nullsFirst: false });

      if (error) throw error;

      const normalizeLinkedUsers = (
        value: unknown
      ): WorkspaceUser['linked_users'] | undefined => {
        if (!Array.isArray(value)) return undefined;

        const parsed = value
          .map((item) => {
            if (!item || typeof item !== 'object') return null;

            const id = (item as { id?: unknown }).id;
            if (typeof id !== 'string') return null;

            const displayName = (item as { display_name?: unknown }).display_name;

            return {
              id,
              display_name: typeof displayName === 'string' ? displayName : null,
            };
          })
          .filter(Boolean) as NonNullable<WorkspaceUser['linked_users']>;

        return parsed;
      };

      return (data ?? []).map((row) => {
        const record = row as Record<string, unknown>;

        return {
          ...(record as unknown as WorkspaceUser),
          linked_users: normalizeLinkedUsers(record.linked_users),
        };
      });
    },
    enabled: !!selectedGroupId,
  });

  const isLoadingData =
    isLoadingIndicators || isLoadingUserIndicators || isLoadingUsers;

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
                   <div className="py-6 text-center text-sm text-muted-foreground">
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
                    {query ? tc('no_results_found') : t('ws-user-groups.search_group_placeholder')}
                  </CommandEmpty>
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
              groupName={selectedGroup.name}
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
