'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Users, X } from '@tuturuuu/icons';
import {
  addWorkspaceGroupTagUserGroups,
  listWorkspaceGroupTagUserGroups,
} from '@tuturuuu/internal-api';
import { listWorkspaceUserGroups } from '@tuturuuu/internal-api/user-groups';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { Button } from '@tuturuuu/ui/button';
import SearchBar from '@tuturuuu/ui/custom/search-bar';
import { Filter } from '@tuturuuu/ui/custom/user-filters';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { removeWorkspaceGroupFromTag, tagUserGroupsQueryKey } from './queries';

interface UserGroupTagDetailFormProps {
  tagId: string;
  wsId: string;
}

export default function UserGroupTagDetailForm({
  tagId,
  wsId,
}: UserGroupTagDetailFormProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');

  const workspaceGroupsQuery = useQuery({
    queryKey: ['workspaces', wsId, 'user-groups', { q: query }],
    queryFn: async (): Promise<{ data: UserGroup[]; count: number }> => {
      const result = await listWorkspaceUserGroups(wsId, {
        pageSize: 100,
        q: query,
      });
      return { count: result.count, data: result.data };
    },
  });

  const taggedGroupsQuery = useQuery({
    queryKey: tagUserGroupsQueryKey(wsId, tagId, { q: query }),
    queryFn: async (): Promise<{ data: UserGroup[]; count: number }> =>
      listWorkspaceGroupTagUserGroups(wsId, tagId, { q: query }),
    enabled: Boolean(tagId),
  });

  const invalidateTaggedGroups = async () => {
    await queryClient.invalidateQueries({
      queryKey: tagUserGroupsQueryKey(wsId, tagId),
    });
  };

  const addGroupsMutation = useMutation({
    mutationFn: (groupIds: string[]) =>
      addWorkspaceGroupTagUserGroups(wsId, tagId, { groupIds }),
    onSuccess: invalidateTaggedGroups,
    onError: (error) => {
      toast({
        title: t('ws-user-group-tags.add_group'),
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  const removeGroupMutation = useMutation({
    mutationFn: (groupId: string) =>
      removeWorkspaceGroupFromTag(wsId, tagId, groupId),
    onSuccess: invalidateTaggedGroups,
    onError: (error) => {
      toast({
        title: t('users.remove_from_group_failed'),
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  const groups = workspaceGroupsQuery.data?.data ?? [];
  const taggedGroups = taggedGroupsQuery.data?.data ?? [];
  const taggedGroupIds = new Set(taggedGroups.map((group) => group.id));

  return (
    <>
      <div className="flex items-center gap-2">
        <SearchBar t={t} className={cn('w-full')} onSearch={setQuery} />
        <Filter
          title={t('ws-user-group-tags.add_group')}
          icon={<Users className="mr-2 h-4 w-4" />}
          options={groups.map((group) => ({
            label: group.name || t('common.name'),
            value: group.id,
            checked: taggedGroupIds.has(group.id),
            disabled: taggedGroupIds.has(group.id),
          }))}
          onSet={(groupIds) => addGroupsMutation.mutate(groupIds)}
          sortCheckedFirst={false}
          className="border-solid"
          contentClassName="w-[min(calc(100vw-1rem),20rem)]"
          variant="secondary"
          align="end"
          hideSelected
        />
      </div>
      {taggedGroups.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-2">
          {taggedGroups.map((group) => (
            <div
              key={group.id}
              className="flex items-start justify-between gap-2 rounded-md border p-2"
            >
              <div className="flex items-center gap-2 p-2">
                <div className="flex flex-col">
                  <div className="font-semibold">
                    {group.name || t('common.name')}
                  </div>
                </div>
              </div>
              <Button
                size="xs"
                type="button"
                variant="destructive"
                onClick={() => removeGroupMutation.mutate(group.id)}
                disabled={removeGroupMutation.isPending}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
