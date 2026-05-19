'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import {
  listWorkspaceBasicUsers,
  type ListWorkspaceBasicUsersResponse,
  type WorkspaceBasicUserRecord,
} from '@tuturuuu/internal-api';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Combobox, type ComboboxOption } from '@tuturuuu/ui/custom/combobox';
import { useDebounce } from '@tuturuuu/ui/hooks/use-debounce';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  getWorkspaceUserDisplayName,
  getWorkspaceUserInitials,
  getWorkspaceUserSecondaryLabel,
} from './workspace-user-display';

export const NO_WORKSPACE_USER = '__none__';

function buildUserOption(
  user: WorkspaceBasicUserRecord,
  noneLabel: string
): ComboboxOption {
  const label = getWorkspaceUserDisplayName(user);
  const description = getWorkspaceUserSecondaryLabel(user);

  return {
    badge: user.archived ? (
      <span className="shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
        {noneLabel}
      </span>
    ) : undefined,
    description,
    icon: (
      <Avatar className="h-7 w-7">
        {user.avatar_url ? (
          <AvatarImage alt={label} src={user.avatar_url} />
        ) : null}
        <AvatarFallback className="bg-dynamic-blue/10 text-[10px] text-dynamic-blue">
          {getWorkspaceUserInitials(user)}
        </AvatarFallback>
      </Avatar>
    ),
    label,
    muted: Boolean(user.archived),
    searchValue: [label, user.email, user.display_name, user.full_name, user.id]
      .filter(Boolean)
      .join(' '),
    value: user.id,
  };
}

interface Props {
  disabled?: boolean;
  onChange: (workspaceUserId: string | null) => void;
  seedUsers?: WorkspaceBasicUserRecord[];
  value: string | null;
  wsId: string;
}

export function WorkspaceVirtualUserLinker({
  disabled,
  onChange,
  seedUsers = [],
  value,
  wsId,
}: Props) {
  const t = useTranslations('ws-topic-announcements');
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 250);

  const usersQuery = useInfiniteQuery<ListWorkspaceBasicUsersResponse>({
    enabled: Boolean(wsId),
    getNextPageParam: (lastPage, allPages) => {
      const loadedCount = allPages.reduce(
        (total, page) => total + page.data.length,
        0
      );

      if (loadedCount >= (lastPage.count ?? 0) || lastPage.data.length < 20) {
        return undefined;
      }

      return loadedCount;
    },
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      listWorkspaceBasicUsers(wsId, {
        from: pageParam as number,
        limit: 20,
        q: debouncedSearch || undefined,
      }),
    queryKey: [
      'topic-announcement-workspace-user-linker',
      wsId,
      debouncedSearch,
    ],
  });

  const queriedUsers = useMemo(() => {
    const pages = usersQuery.data?.pages ?? [];
    const deduped = new Map<string, WorkspaceBasicUserRecord>();

    for (const page of pages) {
      for (const user of page.data ?? []) {
        if (!deduped.has(user.id)) {
          deduped.set(user.id, user);
        }
      }
    }

    return [...deduped.values()];
  }, [usersQuery.data?.pages]);

  const options = useMemo(() => {
    const merged = new Map<string, WorkspaceBasicUserRecord>();

    for (const user of seedUsers) {
      merged.set(user.id, user);
    }
    for (const user of queriedUsers) {
      merged.set(user.id, user);
    }

    const items = [...merged.values()].map((user) =>
      buildUserOption(user, t('archived_user'))
    );

    return [
      {
        label: t('none'),
        muted: true,
        value: NO_WORKSPACE_USER,
      },
      ...items,
    ];
  }, [queriedUsers, seedUsers, t]);

  const selectedValue = value ?? NO_WORKSPACE_USER;

  return (
    <Combobox
      disabled={disabled}
      emptyText={t('no_workspace_users')}
      hasMore={Boolean(usersQuery.hasNextPage)}
      loadingMore={usersQuery.isFetchingNextPage}
      loadMoreText={t('load_more_users')}
      loadingMoreText={t('loading_users')}
      onChange={(next) => {
        const resolved = Array.isArray(next) ? next[0] : next;
        onChange(!resolved || resolved === NO_WORKSPACE_USER ? null : resolved);
      }}
      onLoadMore={() => {
        void usersQuery.fetchNextPage();
      }}
      onSearchChange={setSearch}
      options={options}
      placeholder={t('linked_user_placeholder')}
      searchPlaceholder={t('search_workspace_users')}
      selected={selectedValue}
    />
  );
}
