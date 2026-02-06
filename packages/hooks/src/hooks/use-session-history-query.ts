import {
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseQueryResult,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query';
import { useMemo } from 'react';

export type SessionHistoryFilters = {
  searchQuery: string;
  categoryId: string;
  duration: string;
  timeOfDay: string;
  projectContext: string;
};

export type SessionHistoryPage<TSession> = {
  sessions: TSession[];
  total: number;
  hasMore: boolean;
  nextCursor: string | null;
};

export type SessionHistoryQueryOptions = {
  wsId: string;
  userId: string;
  startOfPeriodIso: string;
  endOfPeriodIso: string;
  timezone: string;
  filters: SessionHistoryFilters;
  enabled?: boolean;
  paginationLimit?: number;
  baseUrl?: string;
  fetcher?: (input: string, init?: RequestInit) => Promise<Response>;
  getSessionsUrl?: (params: { wsId: string; query: string }) => string;
  getPeriodStatsUrl?: (params: { wsId: string; query: string }) => string;
  queryKeyPrefix?: string;
  staleTimeMs?: number;
};

export type SessionHistoryQueryResult<TSession, TPeriodStats> = {
  sessions: TSession[];
  sessionsQuery: UseInfiniteQueryResult<
    InfiniteData<SessionHistoryPage<TSession>>
  >;
  periodStatsQuery: UseQueryResult<TPeriodStats>;
};

const normalizeBaseUrl = (baseUrl?: string) =>
  baseUrl ? baseUrl.replace(/\/$/, '') : '';

const toQueryString = (
  params: Record<string, string | number | null | undefined>
) => {
  const entries = Object.entries(params).filter(
    ([, value]) => value !== undefined && value !== null && value !== ''
  );

  return entries
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
    )
    .join('&');
};

export function useSessionHistoryQuery<TSession, TPeriodStats>({
  wsId,
  userId,
  startOfPeriodIso,
  endOfPeriodIso,
  timezone,
  filters,
  enabled = true,
  paginationLimit = 5,
  baseUrl,
  fetcher,
  getSessionsUrl,
  getPeriodStatsUrl,
  queryKeyPrefix = 'time-tracking-sessions',
  staleTimeMs = 30 * 1000,
}: SessionHistoryQueryOptions): SessionHistoryQueryResult<
  TSession,
  TPeriodStats
> {
  const resolvedBaseUrl = normalizeBaseUrl(baseUrl);
  const resolvedFetch = fetcher ?? fetch;

  const sessionsQuery = useInfiniteQuery<SessionHistoryPage<TSession>>({
    queryKey: [
      queryKeyPrefix,
      wsId,
      userId,
      'history',
      startOfPeriodIso,
      endOfPeriodIso,
      filters,
    ],
    queryFn: async ({ pageParam }) => {
      const query = toQueryString({
        type: 'history',
        limit: paginationLimit,
        dateFrom: startOfPeriodIso,
        dateTo: endOfPeriodIso,
        userId,
        timezone,
        searchQuery: filters.searchQuery,
        categoryId: filters.categoryId,
        duration: filters.duration,
        timeOfDay: filters.timeOfDay,
        projectContext: filters.projectContext,
        cursor: pageParam as string | null,
      });

      const url = getSessionsUrl
        ? getSessionsUrl({ wsId, query })
        : `${resolvedBaseUrl}/api/v1/workspaces/${wsId}/time-tracking/sessions?${query}`;

      const response = await resolvedFetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch sessions');
      }
      return response.json();
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: staleTimeMs,
    enabled,
  });

  const periodStatsQuery = useQuery<TPeriodStats>({
    queryKey: [
      queryKeyPrefix,
      wsId,
      userId,
      'period-stats',
      startOfPeriodIso,
      endOfPeriodIso,
      filters,
    ],
    queryFn: async () => {
      const query = toQueryString({
        dateFrom: startOfPeriodIso,
        dateTo: endOfPeriodIso,
        timezone,
        userId,
        searchQuery: filters.searchQuery,
        categoryId: filters.categoryId,
        duration: filters.duration,
        timeOfDay: filters.timeOfDay,
        projectContext: filters.projectContext,
      });

      const url = getPeriodStatsUrl
        ? getPeriodStatsUrl({ wsId, query })
        : `${resolvedBaseUrl}/api/v1/workspaces/${wsId}/time-tracking/stats/period?${query}`;

      const response = await resolvedFetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch period stats');
      }
      return response.json();
    },
    staleTime: staleTimeMs,
    enabled,
  });

  const sessions = useMemo(
    () => sessionsQuery.data?.pages.flatMap((page) => page.sessions) ?? [],
    [sessionsQuery.data]
  );

  return {
    sessions,
    sessionsQuery,
    periodStatsQuery,
  };
}
