import type { QueryClient, QueryKey } from '@tanstack/react-query';

type RunningSession = { id: string };

export type RunningTimeSessionCacheSnapshot = ReadonlyArray<
  readonly [QueryKey, RunningSession]
>;

const runningTimeSessionQueryRoot = ['running-time-session'] as const;

const isRunningSession = (value: unknown): value is RunningSession =>
  typeof value === 'object' &&
  value !== null &&
  'id' in value &&
  typeof value.id === 'string';

export async function optimisticallyClearRunningTimeSession(
  queryClient: QueryClient,
  sessionId: string
): Promise<RunningTimeSessionCacheSnapshot> {
  await queryClient.cancelQueries({ queryKey: runningTimeSessionQueryRoot });

  const snapshot = queryClient
    .getQueriesData({ queryKey: runningTimeSessionQueryRoot })
    .filter(
      (entry): entry is [QueryKey, RunningSession] =>
        isRunningSession(entry[1]) && entry[1].id === sessionId
    );

  for (const [queryKey] of snapshot) {
    queryClient.setQueryData(queryKey, null);
  }

  return snapshot;
}

export function restoreRunningTimeSessionCache(
  queryClient: QueryClient,
  snapshot: RunningTimeSessionCacheSnapshot
) {
  for (const [queryKey, session] of snapshot) {
    queryClient.setQueryData(queryKey, session);
  }
}

export async function withOptimisticallyClearedRunningTimeSession<T>(
  queryClient: QueryClient,
  sessionId: string,
  mutation: () => Promise<T>
): Promise<T> {
  const snapshot = await optimisticallyClearRunningTimeSession(
    queryClient,
    sessionId
  );

  try {
    return await mutation();
  } catch (error) {
    restoreRunningTimeSessionCache(queryClient, snapshot);
    throw error;
  }
}
