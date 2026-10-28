'use client';

import { useIsFetching, useQuery } from '@tanstack/react-query';
import { getMailBootstrap, getMailUnreadCounts } from '@tuturuuu/internal-api';
import { rememberDefaultMailbox } from './mail-mailbox-hint';

export function useMailBootstrap(workspaceId: string) {
  const bootstrap = useQuery({
    queryKey: ['mail', workspaceId, 'bootstrap'],
    queryFn: async () => {
      const data = await getMailBootstrap(workspaceId, undefined, false);
      rememberDefaultMailbox(workspaceId, data.mailboxes[0]?.id);
      return data;
    },
    staleTime: 30_000,
  });
  // Unread counts fan out per mailbox; keep them off the first list load.
  const loadingFirstThreadPage = useIsFetching({
    queryKey: ['mail', workspaceId],
    predicate: (query) =>
      query.queryKey[3] === 'threads' && query.state.data === undefined,
  });
  const counts = useQuery({
    queryKey: ['mail', workspaceId, 'bootstrap-counts'],
    queryFn: () => getMailUnreadCounts(workspaceId),
    enabled: Boolean(bootstrap.data) && loadingFirstThreadPage === 0,
    staleTime: 30_000,
  });
  return {
    ...bootstrap,
    data: bootstrap.data
      ? {
          ...bootstrap.data,
          mailboxes: bootstrap.data.mailboxes.map((mailbox) => ({
            ...mailbox,
            unreadCount: counts.data?.[mailbox.id] ?? mailbox.unreadCount,
          })),
        }
      : undefined,
  };
}
