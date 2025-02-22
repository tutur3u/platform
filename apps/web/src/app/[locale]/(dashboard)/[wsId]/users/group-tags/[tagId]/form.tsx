'use client';

import { Filter } from '../../../users/filters';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { Button } from '@tuturuuu/ui/button';
import SearchBar from '@tuturuuu/ui/custom/search-bar';
import { cn } from '@tuturuuu/utils';
import { Users, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export interface UserGroupFormProps {
  wsId: string;
  tagId: string;
}

export default function UserGroupForm({ wsId, tagId }: UserGroupFormProps) {
  const t = useTranslations();
  const router = useRouter();

  const [query, setQuery] = useState('');

  const workspaceGroupsQuery = useQuery({
    queryKey: ['workspaces', wsId, 'group-tags', 'user-groups', { query }],
    queryFn: () => getWorkspaceUserGroups(wsId),
  });

  const userGroupsQuery = useQuery({
    queryKey: ['workspaces', wsId, 'groups', 'tags', tagId, { query }],
    queryFn: tagId ? () => getUserGroups(tagId, query) : undefined,
    enabled: !!tagId,
  });

  const groups = workspaceGroupsQuery.data?.data || [];
  const userGroups = userGroupsQuery.data?.data || [];

  const handleNewGroups = async (groupIds: string[]) => {
    const res = await fetch(
      `/api/v1/workspaces/${wsId}/group-tags/${tagId}/user-groups`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ groupIds }),
      }
    );

    if (res.ok) {
      userGroupsQuery.refetch();
      router.refresh();
    }
  };

  const handleRemoveGroup = async (groupId: string) => {
    const res = await fetch(
      `/api/v1/workspaces/${wsId}/group-tags/${tagId}/user-groups/${groupId}`,
      {
        method: 'DELETE',
      }
    );

    if (res.ok) {
      userGroupsQuery.refetch();
      router.refresh();
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <SearchBar t={t} className={cn('w-full')} onSearch={setQuery} />
        <Filter
          title={t('ws-user-group-tags.add_group')}
          icon={<Users className="mr-2 h-4 w-4" />}
          options={groups.map((group) => ({
            label: group.name || 'No name',
            value: group.id,
            // checked: userGroups.some((u) => u.id === user.id),
            // disabled: userGroups.some((u) => u.id === user.id),
          }))}
          onSet={handleNewGroups}
          sortCheckedFirst={false}
          className="border-solid"
          contentClassName="w-[min(calc(100vw-1rem),20rem)]"
          variant="secondary"
          align="end"
          hideSelected
        />
      </div>
      {userGroups.length > 0 ? (
        <div className="mt-4 grid grid-cols-1 gap-2">
          {userGroups.map((group) => (
            <div
              key={group.id}
              className="flex items-start justify-between gap-2 rounded-md border p-2"
            >
              <div className="flex items-center gap-2 p-2">
                <div className="flex flex-col">
                  <div className="font-semibold">
                    {group?.name || 'No name'}
                  </div>
                </div>
              </div>
              <Button
                size="xs"
                type="button"
                variant="destructive"
                onClick={() => handleRemoveGroup(group.id)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded border border-dashed p-4 text-center font-semibold text-foreground/50 md:p-8">
          This tag has no user groups yet.
        </div>
      )}
    </>
  );
}

async function getWorkspaceUserGroups(wsId: string) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_user_groups')
    .select('*')
    .eq('ws_id', wsId)
    .order('id');

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: UserGroup[]; count: number };
}

async function getUserGroups(tagId: string, query?: string) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_user_group_tag_groups')
    .select('...workspace_user_groups!inner(*)', {
      count: 'exact',
    })
    .eq('tag_id', tagId);

  if (query) queryBuilder.ilike('workspace_user_groups.name', `%${query}%`);

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: UserGroup[]; count: number };
}
