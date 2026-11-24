'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { FeedbackReceipt } from './report-problem-model';

export const FEEDBACK_RECEIPTS_QUERY_KEY = ['feedback-receipts'] as const;

/**
 * Receipts of the reports accepted during this session. The backend returns a
 * receipt id per report; the list lives in the query cache so every dialog
 * instance in the app shows the same history.
 */
export function useFeedbackReceipts() {
  const queryClient = useQueryClient();
  const { data } = useQuery<FeedbackReceipt[]>({
    queryKey: FEEDBACK_RECEIPTS_QUERY_KEY,
    queryFn: () => [],
    initialData: [],
    enabled: false,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });

  const addReceipt = useCallback(
    (receipt: FeedbackReceipt) => {
      queryClient.setQueryData<FeedbackReceipt[]>(
        FEEDBACK_RECEIPTS_QUERY_KEY,
        (current = []) => [
          receipt,
          ...current.filter((item) => item.id !== receipt.id),
        ]
      );
    },
    [queryClient]
  );

  return { receipts: data, addReceipt };
}
