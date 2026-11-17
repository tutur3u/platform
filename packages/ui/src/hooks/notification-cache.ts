import type {
  InfiniteData,
  QueryClient,
  QueryKey,
} from '@tanstack/react-query';
import type {
  Notification,
  NotificationFilter,
  NotificationsPage,
} from './notification-types';

export type NotificationPages = InfiniteData<NotificationsPage, number>;

const ROOT = 'notifications';
export const NOTIFICATION_MUTATION_KEY = [ROOT, 'mutation'] as const;

const scoped = (cacheScope?: string) => (cacheScope ? [cacheScope] : []);

export const notificationKeys = {
  root: [ROOT] as const,
  unreadCount: (wsId?: string, cacheScope?: string) => [
    ROOT,
    'unread-count',
    wsId || 'all',
    ...scoped(cacheScope),
  ],
  infinite: (o: {
    wsId?: string;
    unreadOnly?: boolean;
    readOnly?: boolean;
    cacheScope?: string;
  }) => [
    ROOT,
    'infinite',
    o.wsId || 'all',
    o.unreadOnly ?? false,
    o.readOnly ?? false,
    ...scoped(o.cacheScope),
  ],
  list: (filter: NotificationFilter, wsId?: string, cacheScope?: string) =>
    notificationKeys.infinite({
      wsId,
      unreadOnly: filter === 'unread',
      cacheScope,
    }),
};

interface ListKey {
  scope: string;
  unreadOnly: boolean;
  readOnly: boolean;
  cacheScope?: string;
}

export function parseListKey(key: QueryKey): ListKey | null {
  if (key[0] !== ROOT || key[1] !== 'infinite') return null;
  return {
    scope: String(key[2]),
    unreadOnly: key[3] === true,
    readOnly: key[4] === true,
    cacheScope: typeof key[5] === 'string' ? key[5] : undefined,
  };
}

export function parseCountKey(key: QueryKey) {
  if (key[0] !== ROOT || key[1] !== 'unread-count') return null;
  return {
    scope: String(key[2]),
    cacheScope: typeof key[3] === 'string' ? key[3] : undefined,
  };
}

/** A cache entry belongs to the actor when it is unscoped or scoped to them. */
export const sameActor = (keyScope?: string, actor?: string) =>
  !keyScope || !actor || keyScope === actor;

/** Whether a list or count in `listScope` can contain notifications of `wsId`. */
export const scopeContains = (listScope: string, wsId: string | null) =>
  listScope === 'all' || listScope === wsId;

const belongs = (n: Notification, key: ListKey) =>
  key.unreadOnly ? !n.read_at : key.readOnly ? !!n.read_at : true;

const newerFirst = (a: Notification, b: Notification) =>
  a.created_at === b.created_at
    ? b.id.localeCompare(a.id)
    : b.created_at.localeCompare(a.created_at);

const withCount = (data: NotificationPages, delta: number) =>
  delta === 0
    ? data
    : {
        ...data,
        pages: data.pages.map((p) => ({
          ...p,
          count: Math.max(0, p.count + delta),
        })),
      };

function isFullyLoaded(data: NotificationPages) {
  const loaded = data.pages.reduce((n, p) => n + p.notifications.length, 0);
  const total = data.pages.at(-1)?.count ?? 0;
  return loaded >= total;
}

/**
 * Applies one notification's new read state to a cached list: replaces it in
 * place, removes it when it no longer matches the list filter, or inserts it in
 * server order when it now matches and its position is within loaded pages.
 */
export function applyNotificationToList(
  data: NotificationPages,
  key: ListKey,
  next: Notification
): NotificationPages {
  if (!scopeContains(key.scope, next.ws_id)) return data;
  const present = data.pages.some((p) =>
    p.notifications.some((n) => n.id === next.id)
  );
  const fits = belongs(next, key);
  if (present) {
    const pages = data.pages.map((p) => ({
      ...p,
      notifications: fits
        ? p.notifications.map((n) => (n.id === next.id ? next : n))
        : p.notifications.filter((n) => n.id !== next.id),
    }));
    return withCount({ ...data, pages }, fits ? 0 : -1);
  }
  if (!fits) return data;
  let inserted = false;
  const pages = data.pages.map((p) => {
    if (inserted) return p;
    const at = p.notifications.findIndex((n) => newerFirst(next, n) < 0);
    if (at === -1) return p;
    inserted = true;
    const notifications = [...p.notifications];
    notifications.splice(at, 0, next);
    return { ...p, notifications };
  });
  if (!inserted && isFullyLoaded(data) && pages.length > 0) {
    const last = pages.length - 1;
    pages[last] = {
      ...pages[last]!,
      notifications: [...pages[last]!.notifications, next],
    };
  }
  return withCount({ ...data, pages }, 1);
}

/**
 * Marks loaded notifications in `scope` read. Returns the new data and whether
 * the list total is still exact (it is not when unloaded unread rows may have
 * changed inside a broader list).
 */
export function markListRead(
  data: NotificationPages,
  key: ListKey,
  scope: string,
  readAt: string
): { data: NotificationPages; exact: boolean } {
  const hit = (n: Notification) => !n.read_at && scopeContains(scope, n.ws_id);
  const covers = scope === 'all' || scope === key.scope;
  if (key.readOnly) return { data, exact: false };
  if (!key.unreadOnly) {
    const pages = data.pages.map((p) => ({
      ...p,
      notifications: p.notifications.map((n) =>
        hit(n) ? { ...n, read_at: readAt } : n
      ),
    }));
    return { data: { ...data, pages }, exact: true };
  }
  let removed = 0;
  const pages = data.pages.map((p) => ({
    ...p,
    notifications: p.notifications.filter((n) => {
      if (!hit(n)) return true;
      removed += 1;
      return false;
    }),
  }));
  if (covers) {
    return {
      data: { ...data, pages: pages.map((p) => ({ ...p, count: 0 })) },
      exact: true,
    };
  }
  return { data: withCount({ ...data, pages }, -removed), exact: false };
}

export function findCachedNotification(
  queryClient: QueryClient,
  id: string,
  actor?: string
) {
  for (const [key, data] of queryClient.getQueriesData<NotificationPages>({
    queryKey: [ROOT, 'infinite'],
  })) {
    if (!data?.pages || !sameActor(parseListKey(key)?.cacheScope, actor))
      continue;
    for (const page of data.pages) {
      const found = page.notifications.find((n) => n.id === id);
      if (found) return found;
    }
  }
  return undefined;
}

/** Lists for the actor, with the time their data last came from the server. */
export function actorLists(queryClient: QueryClient, actor?: string) {
  return queryClient
    .getQueriesData<NotificationPages>({ queryKey: [ROOT, 'infinite'] })
    .flatMap(([queryKey, data]) => {
      const key = parseListKey(queryKey);
      if (!key || !data?.pages || !sameActor(key.cacheScope, actor)) return [];
      const fetchedAt = queryClient.getQueryState(queryKey)?.dataUpdatedAt ?? 0;
      return [{ queryKey, key, data, fetchedAt }];
    });
}

export function actorCounts(queryClient: QueryClient, actor?: string) {
  return queryClient
    .getQueriesData<number>({ queryKey: [ROOT, 'unread-count'] })
    .flatMap(([queryKey, value]) => {
      const key = parseCountKey(queryKey);
      if (!key || !sameActor(key.cacheScope, actor)) return [];
      return [{ queryKey, key, value }];
    });
}

/**
 * Optimistic writes keep the server fetch time, so a rollback can tell whether
 * a query has received newer server data since the mutation started.
 */
export function writeOptimistic<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  value: T
) {
  const updatedAt = queryClient.getQueryState(queryKey)?.dataUpdatedAt;
  queryClient.setQueryData(queryKey, value, { updatedAt });
}

/**
 * Invalidates only lists and counts that can contain notifications of `scope`.
 * `null` is a user-level notification, which only account-wide entries hold.
 */
export function invalidateScope(
  queryClient: QueryClient,
  scope: string | null,
  actor?: string
) {
  return queryClient.invalidateQueries({
    queryKey: [ROOT],
    refetchType: 'active',
    predicate: ({ queryKey }) => {
      if (queryKey[1] === 'mutation') return false;
      // Single-page lists: ['notifications', scope, limit, offset, ...].
      const parsed = parseListKey(queryKey) ??
        parseCountKey(queryKey) ?? { scope: String(queryKey[1]) };
      if ('cacheScope' in parsed && !sameActor(parsed.cacheScope, actor))
        return false;
      return (
        scope === 'all' || parsed.scope === 'all' || parsed.scope === scope
      );
    },
  });
}

/** Keeps only the first page of closed lists so a reopen refetches one page. */
export function trimClosedList(queryClient: QueryClient, queryKey: QueryKey) {
  const data = queryClient.getQueryData<NotificationPages>(queryKey);
  if (!data || data.pages.length <= 1) return;
  writeOptimistic(queryClient, queryKey, {
    pages: data.pages.slice(0, 1),
    pageParams: data.pageParams.slice(0, 1),
  });
}

/** Updates a row in place in single-page list caches (the full inbox page). */
export function patchPageQueries(
  queryClient: QueryClient,
  next: Pick<Notification, 'id' | 'read_at'>
) {
  for (const [queryKey, data] of queryClient.getQueriesData<NotificationsPage>({
    queryKey: [ROOT],
  })) {
    if (parseListKey(queryKey) || parseCountKey(queryKey)) continue;
    if (!data || !Array.isArray(data.notifications)) continue;
    if (!data.notifications.some((n) => n.id === next.id)) continue;
    writeOptimistic(queryClient, queryKey, {
      ...data,
      notifications: data.notifications.map((n) =>
        n.id === next.id ? { ...n, read_at: next.read_at } : n
      ),
    });
  }
}
