'use client';

import { useQuery } from '@tanstack/react-query';
import { User, X } from '@tuturuuu/icons';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import SearchBar from '@tuturuuu/ui/custom/search-bar';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { cn } from '@tuturuuu/utils/format';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Filter } from '../../../users/filters';

export interface GroupMemberFormProps {
  wsId: string;
  groupId: string;
}

export default function GroupMemberForm({
  wsId,
  groupId,
}: GroupMemberFormProps) {
  const t = useTranslations();
  const router = useRouter();

  const [query, setQuery] = useState('');

  const workspaceMembersQuery = useQuery({
    queryKey: ['workspaces', wsId, 'user-groups', 'members', { query }],
    queryFn: async (): Promise<{ data: WorkspaceUser[]; count: number }> => {
      const searchParams = new URLSearchParams({
        q: query,
        limit: '100',
      });
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/users?${searchParams.toString()}`,
        { cache: 'no-store' }
      );
      if (!res.ok) throw new Error('Failed to fetch workspace users');
      return await res.json();
    },
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
    queryFn: async (): Promise<{ data: WorkspaceUser[]; count: number }> => {
      const searchParams = new URLSearchParams({
        limit: '100',
      });
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/user-groups/${groupId}/members?${searchParams.toString()}`,
        { cache: 'no-store' }
      );
      if (!res.ok) throw new Error('Failed to fetch group members');
      return await res.json();
    },
    enabled: !!groupId,
  });

  const users = workspaceMembersQuery.data?.data || [];
  const groupUsers = groupMembersQuery.data?.data || [];

  const handleNewMembers = async (memberIds: string[]) => {
    const res = await fetch(
      `/api/v1/workspaces/${wsId}/user-groups/${groupId}/members`,
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
      router.refresh();
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    const res = await fetch(
      `/api/v1/workspaces/${wsId}/user-groups/${groupId}/members/${memberId}`,
      {
        method: 'DELETE',
      }
    );

    if (res.ok) {
      groupMembersQuery.refetch();
      router.refresh();
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <SearchBar t={t} className={cn('w-full')} onSearch={setQuery} />
        <Filter
          title={t('ws-members.invite_member')}
          icon={<User className="mr-2 h-4 w-4" />}
          options={users.map((user) => ({
            label: user.display_name || user.full_name || 'No name',
            description: user.email || undefined,
            icon: (
              <Avatar className="relative h-8 w-8 cursor-pointer overflow-visible font-semibold">
                <AvatarImage
                  src={user?.avatar_url ?? undefined}
                  className="overflow-clip rounded-full border border-foreground/50"
                />
                <AvatarFallback className="border border-foreground/50 font-semibold">
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
        <ScrollArea className="h-fit w-full p-2 px-3">
          <div className="mt-4 flex max-h-48 flex-col gap-2">
            {groupUsers.map((user) => (
              <div
                key={user.id}
                className="flex items-start justify-between gap-2 rounded-md border p-2"
              >
                <div className="flex items-center gap-2 p-2">
                  <Avatar className="relative h-12 w-12 overflow-visible font-semibold">
                    <AvatarImage
                      src={user?.avatar_url ?? undefined}
                      className="overflow-clip rounded-full border border-foreground/50"
                    />
                    <AvatarFallback className="border border-foreground/50 font-semibold">
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
        </ScrollArea>
      ) : (
        <div className="mt-4 rounded border border-dashed p-4 text-center font-semibold text-foreground/50 md:p-8">
          This group has no members yet.
        </div>
      )}
    </>
  );
}
