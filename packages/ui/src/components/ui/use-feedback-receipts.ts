'use client';

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type { InternalApiClientOptions } from '@tuturuuu/internal-api/client';
import { listProductFeedbackReceipts } from '@tuturuuu/internal-api/product-feedback';
import { useCallback } from 'react';
import type { FeedbackReceipt } from './report-problem-model';

export const FEEDBACK_RECEIPTS_QUERY_KEY = ['feedback-receipts'] as const;
const PAGE_SIZE = 20;

/**
 * The signed-in user's own receipts, newest first, read from the intake and
 * paged with its keyset cursor. `enabled` defers the first read until the
 * list is shown; `refresh` re-reads it after a submission.
 */
export function useFeedbackReceipts(
  apiOptions: InternalApiClientOptions | undefined,
  enabled: boolean
) {
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: FEEDBACK_RECEIPTS_QUERY_KEY,
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      listProductFeedbackReceipts(
        { limit: PAGE_SIZE, cursor: pageParam },
        apiOptions
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });

  const refresh = useCallback(
    () =>
      queryClient.invalidateQueries({ queryKey: FEEDBACK_RECEIPTS_QUERY_KEY }),
    [queryClient]
  );

  const receipts: FeedbackReceipt[] =
    query.data?.pages.flatMap((page) => page.items) ?? [];

  return {
    receipts,
    isLoading: query.isPending && query.fetchStatus !== 'idle',
    isError: query.isError,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
    refresh,
  };
}
