'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

interface RefetchableQuery {
  isFetching: boolean;
  isFetchingNextPage?: boolean;
  refetch: (options: { throwOnError: true }) => Promise<unknown>;
}

/**
 * One manual sync refetches the list, mailboxes and unread counts together.
 * `refreshing` stays true until every request settles, including background
 * revalidation, but not while loading an older page.
 */
export function useMailRefresh({
  bootstrapQuery,
  mailboxId,
  threadsQuery,
  workspaceId,
}: {
  bootstrapQuery: RefetchableQuery;
  mailboxId: string | null;
  threadsQuery: RefetchableQuery;
  workspaceId: string;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationKey: ['mail', workspaceId, 'refresh'],
    mutationFn: async () => {
      await Promise.all([
        mailboxId ? threadsQuery.refetch({ throwOnError: true }) : null,
        bootstrapQuery.refetch({ throwOnError: true }),
        queryClient.refetchQueries({
          queryKey: ['mail', workspaceId, 'bootstrap-counts'],
        }),
      ]);
    },
  });
  return {
    refresh: () => mutation.mutateAsync(),
    refreshing:
      mutation.isPending ||
      bootstrapQuery.isFetching ||
      (threadsQuery.isFetching && !threadsQuery.isFetchingNextPage),
  };
}
