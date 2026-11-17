import { getInternalApiClient, type InternalApiClientOptions } from './client';

/**
 * Notification read-state helpers for the shared notification popover and
 * inbox hooks. Framework-free: callers inject transport options at the
 * adapter. `SAME_ORIGIN_NOTIFICATION_API` keeps the request on the page's own
 * origin, which every app proxies to the owning notification routes.
 */

const BASE = '/api/v1/notifications';

/** Resolves every notification path against the current origin, unchanged. */
export const SAME_ORIGIN_NOTIFICATION_API: InternalApiClientOptions = {
  appBaseResolver: (path: string) => path,
};

import { NOTIFICATION_RESTORE_LIMIT } from './notification-limits';

export {
  NOTIFICATION_BRIDGE_BODY_LIMIT,
  NOTIFICATION_RESTORE_LIMIT,
} from './notification-limits';

export type NotificationPopoverRow = {
  id: string;
  ws_id: string | null;
  read_at: string | null;
  created_at: string;
  [key: string]: unknown;
};

export type NotificationPopoverPage<Row = NotificationPopoverRow> = {
  notifications: Row[];
  count: number;
  limit: number;
  offset: number;
};

export type NotificationPageQuery = {
  wsId?: string;
  limit: number;
  offset: number;
  unreadOnly?: boolean;
  readOnly?: boolean;
  type?: string;
};

export type MarkAllNotificationsReadResponse = {
  success: true;
  /** Ids the request changed, or null when the change cannot be undone. */
  ids?: string[] | null;
  /**
   * Opaque per-row read-state revisions, aligned with `ids`; null when the
   * change cannot be undone (too many rows, or revisions unavailable).
   */
  undo_revisions?: string[] | null;
};

const client = (options?: InternalApiClientOptions) =>
  getInternalApiClient(options ?? SAME_ORIGIN_NOTIFICATION_API);

export function listNotificationPage<Row = NotificationPopoverRow>(
  query: NotificationPageQuery,
  init: { signal?: AbortSignal } = {},
  options?: InternalApiClientOptions
) {
  return client(options).json<NotificationPopoverPage<Row>>(BASE, {
    cache: 'no-store',
    signal: init.signal,
    query: {
      limit: query.limit,
      offset: query.offset,
      unreadOnly: query.unreadOnly ?? false,
      readOnly: query.readOnly ?? false,
      wsId: query.wsId,
      type: query.type,
    },
  });
}

export async function getUnreadNotificationCount(
  wsId?: string,
  init: { signal?: AbortSignal } = {},
  options?: InternalApiClientOptions
) {
  const data = await client(options).json<{ count: number }>(
    `${BASE}/unread-count`,
    { cache: 'no-store', signal: init.signal, query: { wsId } }
  );
  return data.count;
}

export function setNotificationRead(
  id: string,
  read: boolean,
  options?: InternalApiClientOptions
) {
  return client(options).json<{ success: true }>(
    `${BASE}/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ read }),
    }
  );
}

export function markAllNotificationsRead(
  wsId?: string,
  options?: InternalApiClientOptions
) {
  return client(options).json<MarkAllNotificationsReadResponse>(BASE, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...(wsId && { wsId }), action: 'mark_all_read' }),
  });
}

/**
 * Restores rows to unread only while each row's read-state revision is still
 * the one the mark-all reported. Returns the ids the server actually restored.
 */
export function restoreNotificationsUnread(
  ids: string[],
  revisions: string[],
  options?: InternalApiClientOptions
) {
  // All or nothing: never truncate a token or send an unpaired one.
  if (
    ids.length === 0 ||
    ids.length > NOTIFICATION_RESTORE_LIMIT ||
    ids.length !== revisions.length
  ) {
    return Promise.reject(
      new RangeError(
        `Undo needs 1-${NOTIFICATION_RESTORE_LIMIT} paired ids and revisions`
      )
    );
  }
  return client(options).json<{ ids: string[] }>(BASE, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'restore_unread', ids, revisions }),
  });
}

export function deleteNotificationById(
  id: string,
  options?: InternalApiClientOptions
) {
  return client(options).json<{ success: true }>(
    `${BASE}/${encodeURIComponent(id)}`,
    { method: 'DELETE' }
  );
}
