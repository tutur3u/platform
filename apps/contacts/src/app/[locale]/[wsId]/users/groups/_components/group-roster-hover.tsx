'use client';

import type { InfiniteData } from '@tanstack/react-query';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Users } from '@tuturuuu/icons';
import type {
  ListWorkspaceUserGroupMembersResponse,
  WorkspaceUserGroupRosterMember,
} from '@tuturuuu/internal-api';
import { listWorkspaceUserGroupMembers } from '@tuturuuu/internal-api';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@tuturuuu/ui/hover-card';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { buildWorkspaceUserSearchValue } from '@tuturuuu/users-core/lib/workspace-user-search';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';

const ROSTER_PAGE_SIZE = 25;

interface GroupRosterHoverProps {
  groupId: string;
  managerCount?: number;
  nonManagerCount?: number;
  onSearchTextChange?: (groupId: string, value: string) => void;
  wsId: string;
}

function memberName(member: WorkspaceUserGroupRosterMember) {
  return (
    member.full_name ||
    member.display_name ||
    member.email ||
    member.phone ||
    ''
  );
}

function memberSearchText(member: WorkspaceUserGroupRosterMember) {
  return buildWorkspaceUserSearchValue({
    display_name: member.display_name,
    email: member.email,
    full_name: member.full_name,
    phone: member.phone,
  });
}

function RosterMemberRow({
  member,
}: {
  member: WorkspaceUserGroupRosterMember;
}) {
  const t = useTranslations('ws-user-group-schedule');
  const name = memberName(member) || t('unknown_member');

  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-1.5 py-1.5">
      <Avatar className="size-8">
        <AvatarImage alt={name} src={member.avatar_url || undefined} />
        <AvatarFallback className="text-[10px]">
          {getInitials(name) || '?'}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="truncate font-medium text-sm">{name}</div>
        <div className="truncate text-muted-foreground text-xs">
          {[member.email, member.phone].filter(Boolean).join(' | ')}
        </div>
      </div>
      {member.role === 'TEACHER' && (
        <Badge
          className="rounded-sm px-1.5 py-0 text-[10px]"
          variant="secondary"
        >
          {t('manager_role')}
        </Badge>
      )}
    </div>
  );
}

export function GroupRosterHover({
  groupId,
  managerCount = 0,
  nonManagerCount = 0,
  onSearchTextChange,
  wsId,
}: GroupRosterHoverProps) {
  const t = useTranslations('ws-user-group-schedule');
  const [open, setOpen] = useState(false);

  const membersQuery = useInfiniteQuery<
    ListWorkspaceUserGroupMembersResponse,
    Error,
    InfiniteData<ListWorkspaceUserGroupMembersResponse>,
    readonly ['workspace-user-group-members', string, string],
    number
  >({
    enabled: open,
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      listWorkspaceUserGroupMembers(wsId, groupId, {
        limit: ROSTER_PAGE_SIZE,
        offset: pageParam,
      }),
    queryKey: ['workspace-user-group-members', wsId, groupId] as const,
    staleTime: 60_000,
  });

  const members = useMemo(
    () => membersQuery.data?.pages.flatMap((page) => page.data) ?? [],
    [membersQuery.data?.pages]
  );
  const membersSearchText = useMemo(
    () => members.map(memberSearchText).join(' '),
    [members]
  );
  const lastPublishedSearchTextRef = useRef<string | null>(null);

  useEffect(() => {
    if (!onSearchTextChange || membersSearchText.length === 0) return;
    const publishKey = `${groupId}\u0000${membersSearchText}`;
    if (lastPublishedSearchTextRef.current === publishKey) return;
    lastPublishedSearchTextRef.current = publishKey;
    onSearchTextChange(groupId, membersSearchText);
  }, [groupId, membersSearchText, onSearchTextChange]);

  const totalCount = managerCount + nonManagerCount;

  return (
    <HoverCard openDelay={120} onOpenChange={setOpen}>
      <HoverCardTrigger asChild>
        <Button
          className="h-7 min-w-0 gap-1.5 rounded-sm px-2 text-xs"
          size="sm"
          type="button"
          variant="outline"
        >
          <Users className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {t('group_members_count', { count: totalCount })}
          </span>
          <span className="text-muted-foreground">
            {t('group_managers_count_short', { count: managerCount })}
          </span>
        </Button>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        className="w-96 max-w-[calc(100vw-2rem)] p-0"
      >
        <div className="border-b px-3 py-2">
          <div className="font-medium text-sm">{t('group_roster_title')}</div>
          <div className="text-muted-foreground text-xs">
            {t('group_roster_counts', {
              managers: managerCount,
              members: nonManagerCount,
            })}
          </div>
        </div>
        <div
          className="max-h-80 overflow-y-auto p-2"
          data-testid="group-roster-list"
          onScroll={(event) => {
            const element = event.currentTarget;
            const distance =
              element.scrollHeight - element.scrollTop - element.clientHeight;
            if (
              distance < 48 &&
              membersQuery.hasNextPage &&
              !membersQuery.isFetchingNextPage
            ) {
              void membersQuery.fetchNextPage();
            }
          }}
        >
          {membersQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : members.length === 0 ? (
            <div className="px-2 py-6 text-center text-muted-foreground text-sm">
              {t('group_roster_empty')}
            </div>
          ) : (
            <div className="space-y-1">
              {members.map((member) => (
                <RosterMemberRow key={member.id} member={member} />
              ))}
              {membersQuery.isFetchingNextPage && (
                <div className="space-y-2 pt-1">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              )}
            </div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
