'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  collectHybridSearchResults,
  hasCompleteHybridSearchCache,
  normalizeSearchQuery,
} from './hybrid-search';

export function useHybridSearchResults<T>({
  getId,
  isFetching,
  query,
  queryKey,
  serverQuery,
  visibleItems,
}: {
  getId: (item: T) => string;
  isFetching: boolean;
  query: string;
  queryKey: readonly unknown[];
  serverQuery: string;
  visibleItems: T[];
}) {
  const queryClient = useQueryClient();
  const entries = queryClient.getQueriesData({ queryKey });
  const results = useMemo(
    () =>
      collectHybridSearchResults({
        entries,
        getId,
        query,
        visibleItems,
      }),
    [entries, getId, query, visibleItems]
  );
  const normalizedQuery = normalizeSearchQuery(query);
  const normalizedServerQuery = normalizeSearchQuery(serverQuery);

  return {
    results,
    status: {
      cachedCount: results.length,
      hasCompleteCache: hasCompleteHybridSearchCache(entries),
      isLocalFirst:
        Boolean(normalizedQuery) && normalizedQuery !== normalizedServerQuery,
      isRefreshing: Boolean(normalizedQuery) && isFetching,
    },
  };
}
