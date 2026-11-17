import type { InternalApiClientOptions } from '@tuturuuu/internal-api/client';
import {
  deleteNotificationById,
  NOTIFICATION_RESTORE_LIMIT,
  getUnreadNotificationCount,
  listNotificationPage,
  markAllNotificationsRead,
  restoreNotificationsUnread,
  setNotificationRead,
} from '@tuturuuu/internal-api/notification-popover';
import type {
  MarkAllReadResult,
  Notification,
  NotificationsPage,
  NotificationType,
  UndoMarkAllResult,
} from './notification-types';

/**
 * Adapters from the canonical internal-api notification helpers to the shapes
 * the hooks cache. `options` is the transport injected by the host runtime;
 * when omitted the helpers keep requests on the page's own origin.
 */
export type NotificationApiOptions = InternalApiClientOptions | undefined;

export function dedupeNotifications(
  notifications: Notification[]
): Notification[] {
  const seen = new Set<string>();
  return notifications.filter((notification) => {
    if (seen.has(notification.id)) return false;
    seen.add(notification.id);
    return true;
  });
}

export interface FetchNotificationsParams {
  wsId?: string;
  limit: number;
  offset: number;
  unreadOnly?: boolean;
  readOnly?: boolean;
  type?: NotificationType;
  signal?: AbortSignal;
}

export async function fetchNotificationsPage(
  { signal, ...query }: FetchNotificationsParams,
  options?: NotificationApiOptions
): Promise<NotificationsPage> {
  const data = await listNotificationPage<Notification>(
    query,
    { signal },
    options
  );
  return {
    ...data,
    notifications: dedupeNotifications(data.notifications ?? []),
  };
}

export function fetchUnreadCount(
  wsId?: string,
  signal?: AbortSignal,
  options?: NotificationApiOptions
) {
  return getUnreadNotificationCount(wsId, { signal }, options);
}

export function patchNotificationRead(
  id: string,
  read: boolean,
  options?: NotificationApiOptions
) {
  return setNotificationRead(id, read, options);
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((id) => typeof id === 'string');

export async function patchMarkAllRead(
  wsId?: string,
  options?: NotificationApiOptions
): Promise<MarkAllReadResult> {
  const data = await markAllNotificationsRead(wsId, options);
  const ids = isStringArray(data?.ids) ? data.ids : null;
  const revisions = isStringArray(data?.undo_revisions)
    ? data.undo_revisions
    : null;
  // Undo needs every changed id paired with its revision.
  // Undo is all or nothing: a token above the shared limit is never offered,
  // truncated or partially sent.
  const undoable =
    !!ids &&
    !!revisions &&
    ids.length > 0 &&
    ids.length <= NOTIFICATION_RESTORE_LIMIT &&
    ids.length === revisions.length;
  return {
    scope: wsId || 'all',
    ids: undoable ? ids : null,
    undoRevisions: undoable ? revisions : null,
  };
}

export async function patchRestoreUnread(
  ids: string[],
  revisions: string[],
  options?: NotificationApiOptions
): Promise<UndoMarkAllResult> {
  const data = await restoreNotificationsUnread(ids, revisions, options);
  if (!isStringArray(data?.ids))
    throw new Error('Undo response did not list restored ids');
  return { requested: ids.length, restored: data.ids };
}

export function deleteNotification(
  id: string,
  options?: NotificationApiOptions
) {
  return deleteNotificationById(id, options);
}
