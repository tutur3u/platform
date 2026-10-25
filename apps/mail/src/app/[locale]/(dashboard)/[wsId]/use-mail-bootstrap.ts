'use client';

import { useQuery } from '@tanstack/react-query';
import { getMailBootstrap, getMailUnreadCounts } from '@tuturuuu/internal-api';

export function useMailBootstrap(workspaceId: string) {
  const bootstrap = useQuery({
    queryKey: ['mail', workspaceId, 'bootstrap'],
    queryFn: () => getMailBootstrap(workspaceId, undefined, false),
    staleTime: 30_000,
  });
  const counts = useQuery({
    queryKey: ['mail', workspaceId, 'bootstrap-counts'],
    queryFn: () => getMailUnreadCounts(workspaceId),
    enabled: Boolean(bootstrap.data),
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
