import type {
  InfiniteData,
  QueryClient,
  QueryKey,
} from '@tanstack/react-query';
import {
  optimisticallyClearRunningTimeSession,
  type RunningTimeSessionCacheSnapshot,
  restoreRunningTimeSessionCache,
} from '@tuturuuu/tasks-ui/tu-do/shared/task-time-tracking-cache';

type SessionSummary = { id: string };
type HistoryPage = {
  sessions: SessionSummary[];
  total: number;
  hasMore: boolean;
  nextCursor: string | null;
};
type HistoryData = InfiniteData<HistoryPage>;

export type TimeTrackingSessionCacheSnapshot = {
  history: ReadonlyArray<readonly [QueryKey, HistoryData]>;
  running: RunningTimeSessionCacheSnapshot;
};

const isHistoryData = (value: unknown): value is HistoryData =>
  typeof value === 'object' &&
  value !== null &&
  'pages' in value &&
  Array.isArray(value.pages);

export async function optimisticallyRemoveTimeTrackingSession(
  queryClient: QueryClient,
  workspaceId: string,
  sessionId: string
): Promise<TimeTrackingSessionCacheSnapshot> {
  const historyRoot = ['time-tracking-sessions', workspaceId] as const;
  await queryClient.cancelQueries({ queryKey: historyRoot });

  const history = queryClient
    .getQueriesData({ queryKey: historyRoot })
    .filter(
      (entry): entry is [QueryKey, HistoryData] =>
        isHistoryData(entry[1]) &&
        entry[1].pages.some((page) =>
          page.sessions.some((session) => session.id === sessionId)
        )
    );

  for (const [queryKey, data] of history) {
    queryClient.setQueryData<HistoryData>(queryKey, {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        sessions: page.sessions.filter((session) => session.id !== sessionId),
        total: Math.max(0, page.total - 1),
      })),
    });
  }

  return {
    history,
    running: await optimisticallyClearRunningTimeSession(
      queryClient,
      sessionId
    ),
  };
}

export function restoreTimeTrackingSessionCache(
  queryClient: QueryClient,
  snapshot: TimeTrackingSessionCacheSnapshot
) {
  for (const [queryKey, data] of snapshot.history) {
    queryClient.setQueryData(queryKey, data);
  }
  restoreRunningTimeSessionCache(queryClient, snapshot.running);
}
