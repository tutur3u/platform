import {
  type QueryClient,
  type QueryKey,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import {
  type NotificationApiOptions,
  patchMarkAllRead,
  patchNotificationRead,
  patchRestoreUnread,
} from './notification-api';
import {
  actorCounts,
  actorLists,
  applyNotificationToList,
  findCachedNotification,
  invalidateScope,
  markListRead,
  NOTIFICATION_MUTATION_KEY,
  notificationKeys,
  patchPageQueries,
  writeOptimistic,
} from './notification-cache';
import type { MarkAllReadResult, Notification } from './notification-types';

interface ActorOptions {
  /** The signed-in user id the caches are scoped to. */
  cacheScope?: string;
  /** Transport injected by the host runtime; same-origin when omitted. */
  apiOptions?: NotificationApiOptions;
}

type Versions = Map<string, number>;
const hash = (key: QueryKey) => JSON.stringify(key);

async function prepare(queryClient: QueryClient) {
  await queryClient.cancelQueries({ queryKey: notificationKeys.root });
}

function snapshotVersions(queryClient: QueryClient, actor?: string) {
  const versions: Versions = new Map();
  for (const { queryKey, fetchedAt } of actorLists(queryClient, actor))
    versions.set(hash(queryKey), fetchedAt);
  return versions;
}

/**
 * Reverts optimistic rows without overwriting newer state: lists that fetched
 * server data since the mutation started are left alone, and a row is only
 * restored while it still shows the optimistic value.
 */
function revertRows(
  queryClient: QueryClient,
  actor: string | undefined,
  versions: Versions,
  originals: Notification[],
  optimisticReadAt: string | null
) {
  for (const { queryKey, key, data, fetchedAt } of actorLists(
    queryClient,
    actor
  )) {
    if (versions.get(hash(queryKey)) !== fetchedAt) continue;
    let next = data;
    for (const original of originals) {
      const current = next.pages
        .flatMap((p) => p.notifications)
        .find((n) => n.id === original.id);
      if (current && current.read_at !== optimisticReadAt) continue;
      next = applyNotificationToList(next, key, original);
    }
    if (next !== data) writeOptimistic(queryClient, queryKey, next);
  }
}

function settle(
  queryClient: QueryClient,
  scope: string | null,
  actor?: string
) {
  const pending = queryClient.isMutating({
    mutationKey: NOTIFICATION_MUTATION_KEY,
  });
  // Concurrent changes reconcile once, after the last one settles, across
  // every scope they touched.
  if (pending > 1) return;
  return invalidateScope(
    queryClient,
    concurrent.delete(queryClient) ? 'all' : scope,
    actor
  );
}

/** Clients whose changes overlapped since their last refresh. */
const concurrent = new WeakSet<QueryClient>();

function noteConcurrency(queryClient: QueryClient) {
  if (queryClient.isMutating({ mutationKey: NOTIFICATION_MUTATION_KEY }) > 1)
    concurrent.add(queryClient);
}

type CountSnapshot = { queryKey: QueryKey; before: number; after: number };

/** Restores counts that still show this change's optimistic value. */
function restoreCounts(queryClient: QueryClient, counts: CountSnapshot[]) {
  for (const { queryKey, before, after } of counts) {
    if (queryClient.getQueryData<number>(queryKey) === after)
      writeOptimistic(queryClient, queryKey, before);
  }
}

/** Marks one notification read or unread with a scope-correct optimistic update. */
export function useUpdateNotification({
  cacheScope,
  apiOptions,
}: ActorOptions = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: NOTIFICATION_MUTATION_KEY,
    mutationFn: ({ id, read }: { id: string; read: boolean }) =>
      patchNotificationRead(id, read, apiOptions),
    onMutate: async ({ id, read }) => {
      await prepare(queryClient);
      noteConcurrency(queryClient);
      const versions = snapshotVersions(queryClient, cacheScope);
      const target = findCachedNotification(queryClient, id, cacheScope);
      const stamp = read ? new Date().toISOString() : null;
      patchPageQueries(queryClient, { id, read_at: stamp });
      if (!target) return { target, stamp, versions, counts: [] };
      const next: Notification = { ...target, read_at: stamp };
      for (const { queryKey, key, data } of actorLists(
        queryClient,
        cacheScope
      )) {
        const updated = applyNotificationToList(data, key, next);
        if (updated !== data) writeOptimistic(queryClient, queryKey, updated);
      }
      const counts: CountSnapshot[] = [];
      if (!target.read_at !== !stamp) {
        for (const { queryKey, key, value } of actorCounts(
          queryClient,
          cacheScope
        )) {
          if (typeof value !== 'number') continue;
          if (key.scope !== 'all' && key.scope !== target.ws_id) continue;
          const after = Math.max(0, value + (read ? -1 : 1));
          writeOptimistic(queryClient, queryKey, after);
          counts.push({ queryKey, before: value, after });
        }
      }
      return { target, stamp, versions, counts };
    },
    onError: (_error, _vars, context) => {
      if (!context?.target) return;
      restoreCounts(queryClient, context.counts);
      revertRows(
        queryClient,
        cacheScope,
        context.versions,
        [context.target],
        context.stamp
      );
    },
    onSettled: (_data, _error, _vars, context) =>
      settle(
        queryClient,
        context?.target ? context.target.ws_id : 'all',
        cacheScope
      ),
  });
}

/** Marks every unread notification in `wsId` (or everywhere) read. */
export function useMarkAllAsRead({
  cacheScope,
  apiOptions,
}: ActorOptions = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: NOTIFICATION_MUTATION_KEY,
    mutationFn: (wsId?: string) => patchMarkAllRead(wsId, apiOptions),
    onMutate: async (wsId?: string) => {
      await prepare(queryClient);
      noteConcurrency(queryClient);
      const scope = wsId || 'all';
      const stamp = new Date().toISOString();
      const versions = snapshotVersions(queryClient, cacheScope);
      const originals = new Map<string, Notification>();
      for (const { queryKey, key, data } of actorLists(
        queryClient,
        cacheScope
      )) {
        for (const n of data.pages.flatMap((p) => p.notifications)) {
          if (!n.read_at && (scope === 'all' || n.ws_id === scope))
            originals.set(n.id, n);
        }
        const result = markListRead(data, key, scope, stamp);
        if (result.data !== data)
          writeOptimistic(queryClient, queryKey, result.data);
      }
      const counts: CountSnapshot[] = [];
      for (const { queryKey, key, value } of actorCounts(
        queryClient,
        cacheScope
      )) {
        if (typeof value !== 'number') continue;
        if (scope === 'all' || key.scope === scope) {
          writeOptimistic(queryClient, queryKey, 0);
          counts.push({ queryKey, before: value, after: 0 });
        }
      }
      return {
        scope,
        stamp,
        versions,
        counts,
        originals: [...originals.values()],
      };
    },
    onError: (_error, _wsId, context) => {
      if (!context) return;
      restoreCounts(queryClient, context.counts);
      revertRows(
        queryClient,
        cacheScope,
        context.versions,
        context.originals,
        context.stamp
      );
    },
    onSettled: (_data, _error, wsId) =>
      settle(queryClient, wsId || 'all', cacheScope),
  });
}

/**
 * Restores a mark-all to unread on the server, conditioned on each row's
 * read-state revision. Rows changed by any later read-state write keep their
 * newer state. Nothing is shown as restored until the server reports which rows
 * it restored; the scope is then re-read.
 */
export function useUndoMarkAllAsRead({
  cacheScope,
  apiOptions,
}: ActorOptions = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: NOTIFICATION_MUTATION_KEY,
    mutationFn: (result: MarkAllReadResult) => {
      if (!result.ids?.length || !result.undoRevisions)
        throw new Error('This change cannot be undone');
      return patchRestoreUnread(result.ids, result.undoRevisions, apiOptions);
    },
    onMutate: () => prepare(queryClient),
    onSettled: (_data, _error, result) =>
      settle(queryClient, result.scope, cacheScope),
  });
}
