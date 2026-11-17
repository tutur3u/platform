import {
  infiniteQueryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  deleteNotification,
  fetchNotificationsPage,
  fetchUnreadCount,
  type NotificationApiOptions,
} from './notification-api';
import {
  NOTIFICATION_MUTATION_KEY,
  notificationKeys,
} from './notification-cache';
import type { NotificationType } from './notification-types';

export {
  dedupeNotifications,
  type NotificationApiOptions,
} from './notification-api';
export {
  NOTIFICATION_MUTATION_KEY,
  notificationKeys,
} from './notification-cache';
export {
  __resetNotificationSubscriptionRegistryForTests,
  useNotificationSubscription,
} from './notification-subscription';
export type {
  MarkAllReadResult,
  Notification,
  NotificationActor,
  NotificationFilter,
  NotificationsPage,
  NotificationType,
  UndoMarkAllResult,
} from './notification-types';
export {
  useMarkAllAsRead,
  useUndoMarkAllAsRead,
  useUpdateNotification,
} from './use-notification-mutations';

export const UNREAD_COUNT_STALE_TIME_MS = 5 * 60 * 1000;
export const UNREAD_COUNT_FALLBACK_INTERVAL_MS = 15 * 60 * 1000;
const LIST_STALE_TIME_MS = 30_000;
const LIST_GC_TIME_MS = 5 * 60 * 1000;

interface UseNotificationsOptions {
  cacheScope?: string;
  wsId?: string;
  limit?: number;
  offset?: number;
  unreadOnly?: boolean;
  readOnly?: boolean;
  type?: NotificationType;
  apiOptions?: NotificationApiOptions;
}

/**
 * One page of notifications.
 * @param wsId - Filters to one workspace; omitted means every accessible one.
 */
export function useNotifications({
  cacheScope,
  wsId,
  limit = 20,
  offset = 0,
  unreadOnly = false,
  readOnly = false,
  type,
  apiOptions,
}: UseNotificationsOptions) {
  return useQuery({
    queryKey: [
      'notifications',
      wsId || 'all',
      limit,
      offset,
      unreadOnly,
      readOnly,
      type,
      ...(cacheScope ? [cacheScope] : []),
    ],
    queryFn: ({ signal }) =>
      fetchNotificationsPage(
        { wsId, limit, offset, unreadOnly, readOnly, type, signal },
        apiOptions
      ),
    staleTime: LIST_STALE_TIME_MS,
    gcTime: LIST_GC_TIME_MS,
  });
}

export interface NotificationListOptions {
  cacheScope?: string;
  wsId?: string;
  unreadOnly?: boolean;
  readOnly?: boolean;
  pageSize?: number;
  /** Transport injected by the host runtime; same-origin when omitted. */
  apiOptions?: NotificationApiOptions;
}

/** Shared by the list hook and intent prefetch so both hit one cache entry. */
export function notificationListOptions({
  cacheScope,
  wsId,
  unreadOnly = false,
  readOnly = false,
  pageSize = 20,
  apiOptions,
}: NotificationListOptions) {
  return infiniteQueryOptions({
    queryKey: notificationKeys.infinite({
      wsId,
      unreadOnly,
      readOnly,
      cacheScope,
    }),
    queryFn: ({ pageParam, signal }) =>
      fetchNotificationsPage(
        {
          wsId,
          limit: pageSize,
          offset: pageParam,
          unreadOnly,
          readOnly,
          signal,
        },
        apiOptions
      ),
    initialPageParam: 0,
    // Offsets follow the loaded rows, so optimistic removals and insertions
    // do not skip or repeat a row at the page boundary.
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((n, p) => n + p.notifications.length, 0);
      return loaded < lastPage.count && lastPage.notifications.length > 0
        ? loaded
        : undefined;
    },
    staleTime: LIST_STALE_TIME_MS,
    gcTime: LIST_GC_TIME_MS,
  });
}

/**
 * Background refreshes wait while a read-state change is in flight: a poll
 * that starts before the server applies the change would briefly restore the
 * old state. Each change refreshes its scope once it settles.
 */
function useIdleRefresh(interval?: number) {
  const queryClient = useQueryClient();
  const idle = () =>
    queryClient.isMutating({ mutationKey: NOTIFICATION_MUTATION_KEY }) === 0;
  return {
    refetchInterval:
      interval === undefined ? undefined : () => (idle() ? interval : false),
    refetchOnWindowFocus: idle,
  };
}

/** Paginated notifications; disabled lists make no request. */
export function useInfiniteNotifications({
  enabled = true,
  refetchInterval,
  ...options
}: NotificationListOptions & {
  enabled?: boolean;
  refetchInterval?: number;
}) {
  const refresh = useIdleRefresh(refetchInterval);
  return useInfiniteQuery({
    ...notificationListOptions(options),
    enabled,
    ...refresh,
    refetchIntervalInBackground: false,
  });
}

/**
 * Unread count for a workspace, or for every accessible notification. This is
 * the only notification query a closed bell runs.
 */
export function useUnreadCount(
  wsId?: string,
  options?: {
    cacheScope?: string;
    enabled?: boolean;
    refetchInterval?: number;
    apiOptions?: NotificationApiOptions;
  }
) {
  const refresh = useIdleRefresh(
    options?.refetchInterval ?? UNREAD_COUNT_FALLBACK_INTERVAL_MS
  );
  return useQuery({
    queryKey: notificationKeys.unreadCount(wsId, options?.cacheScope),
    queryFn: ({ signal }) =>
      fetchUnreadCount(wsId, signal, options?.apiOptions),
    enabled: options?.enabled ?? true,
    staleTime: UNREAD_COUNT_STALE_TIME_MS,
    // Shared refreshes are the primary update path; this is a safety net for
    // disconnected or suspended sessions.
    ...refresh,
    refetchIntervalInBackground: false,
    refetchOnReconnect: true,
  });
}

export function useDeleteNotification({
  apiOptions,
}: { apiOptions?: NotificationApiOptions } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteNotification(id, apiOptions),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: notificationKeys.root }),
  });
}
