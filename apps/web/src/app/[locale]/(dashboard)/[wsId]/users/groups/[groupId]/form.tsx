'use client';

import { UserDatabaseFilter } from '../../../users/filters';
import { cn } from '@/lib/utils';
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { getInitials } from '@/utils/name-helper';
import { createClient } from '@/utils/supabase/client';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@repo/ui/components/ui/avatar';
import { Button } from '@repo/ui/components/ui/button';
import SearchBar from '@repo/ui/components/ui/custom/search-bar';
import { useQuery } from '@tanstack/react-query';
import { User, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export interface GroupMemberFormProps {
  wsId: string;
  groupId: string;
  onUpdate?: React.Dispatch<React.SetStateAction<number>>;
}

export default function GroupMemberForm({
  wsId,
  groupId,
  onUpdate = () => {},
}: GroupMemberFormProps) {
  const t = useTranslations();
  const [query, setQuery] = useState('');

  const workspaceMembersQuery = useQuery({
    queryKey: ['workspaces', wsId, 'members'],
    queryFn: () => getWorkspaceUsers(wsId),
  });

  const groupMembersQuery = useQuery({
    queryKey: [
      'workspaces',
      wsId,
      'users',
      'groups',
      groupId,
      'members',
      { query },
    ],
    queryFn: groupId ? () => getUsers(groupId, query) : undefined,
    enabled: !!groupId,
  });

  const users = workspaceMembersQuery.data?.data || [];
  const groupUsers = groupMembersQuery.data?.data || [];

  useEffect(() => {
    if (groupMembersQuery.isFetched)
      onUpdate(groupMembersQuery.data?.count || 0);
  }, [groupMembersQuery.isFetched, groupMembersQuery.data?.count, onUpdate]);

  const handleNewMembers = async (memberIds: string[]) => {
    const res = await fetch(
      `/api/v1/workspaces/${wsId}/users/groups/${groupId}/members`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ memberIds }),
      }
    );

    if (res.ok) {
      groupMembersQuery.refetch();
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    const res = await fetch(
      `/api/v1/workspaces/${wsId}/users/groups/${groupId}/members/${memberId}`,
      {
        method: 'DELETE',
      }
    );

    if (res.ok) {
      groupMembersQuery.refetch();
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <SearchBar t={t} className={cn('w-full')} onSearch={setQuery} />
        <UserDatabaseFilter
          title={t('ws-members.invite_member')}
          icon={<User className="mr-2 h-4 w-4" />}
          options={users.map((user) => ({
            label: user.display_name || user.full_name || 'No name',
            description: user.email,
            icon: (
              <Avatar className="relative h-8 w-8 cursor-pointer overflow-visible font-semibold">
                <AvatarImage
                  src={user?.avatar_url ?? undefined}
                  className="border-foreground/50 overflow-clip rounded-full border"
                />
                <AvatarFallback className="border-foreground/50 border font-semibold">
                  {user?.display_name ? (
                    getInitials(user.display_name)
                  ) : (
                    <User className="h-5 w-5" />
                  )}
                </AvatarFallback>
              </Avatar>
            ),
            value: user.id,
            checked: groupUsers.some((u) => u.id === user.id),
            disabled: groupUsers.some((u) => u.id === user.id),
          }))}
          onSet={handleNewMembers}
          sortCheckedFirst={false}
          className="border-solid"
          contentClassName="w-[min(calc(100vw-1rem),20rem)]"
          variant="secondary"
          align="end"
          hideSelected
        />
      </div>
      {groupUsers.length > 0 ? (
        <div className="mt-4 grid grid-cols-1 gap-2">
          {groupUsers.map((user) => (
            <div
              key={user.id}
              className="flex items-start justify-between gap-2 rounded-md border p-2"
            >
              <div className="flex items-center gap-2 p-2">
                <Avatar className="relative h-12 w-12 overflow-visible font-semibold">
                  <AvatarImage
                    src={user?.avatar_url ?? undefined}
                    className="border-foreground/50 overflow-clip rounded-full border"
                  />
                  <AvatarFallback className="border-foreground/50 border font-semibold">
                    {user?.display_name
                      ? getInitials(user?.display_name)
                      : null}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <div className="font-semibold">
                    {users.find((u) => u.id === user.id)?.display_name ||
                      'No name'}
                  </div>
                  <div className="text-foreground/50">
                    {users.find((u) => u.id === user.id)?.email}
                  </div>
                </div>
              </div>
              <Button
                size="xs"
                type="button"
                variant="destructive"
                onClick={() => handleRemoveMember(user.id)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-foreground/50 mt-4 rounded border border-dashed p-4 text-center font-semibold md:p-8">
          This group has no members yet.
        </div>
      )}
    </>
  );
}

async function getWorkspaceUsers(wsId: string) {
  const supabase = createClient();

  const queryBuilder = supabase
    .from('workspace_user_linked_users')
    .select(
      'id:platform_user_id, ...workspace_users!inner(full_name, display_name), ...users(...user_private_details(email))'
    )
    .eq('ws_id', wsId)
    .order('platform_user_id');

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: WorkspaceUser[]; count: number };
}

async function getUsers(roleId: string, query?: string) {
  const supabase = createClient();

  const queryBuilder = supabase
    .from('workspace_role_members')
    .select('...users!inner(*)', {
      count: 'exact',
    })
    .eq('role_id', roleId);

  if (query) queryBuilder.ilike('users.display_name', `%${query}%`);

  const { data, count, error } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: WorkspaceUser[]; count: number };
}
