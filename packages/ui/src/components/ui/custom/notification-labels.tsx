// Serializable label contract shared by every popover host. Server hosts pass
// strings across the RSC boundary, so counts use a `{count}` placeholder that
// the client fills in.

export const DEFAULT_NOTIFICATION_LABELS = {
  notifications: 'Notifications',
  unread: 'Unread',
  all: 'All',
  unreadCount: '{count} unread',
  markAllRead: 'Mark all as read',
  markedAllRead: 'Marked all as read',
  markAllError: 'Couldn’t mark all as read',
  undo: 'Undo',
  undoDone: 'Restored as unread',
  undoPartial: 'Restored. Some notifications changed elsewhere and were kept.',
  undoError: 'Couldn’t undo',
  markAsRead: 'Mark as read',
  markAsUnread: 'Mark as unread',
  markedAsRead: 'Marked as read',
  markedAsUnread: 'Marked as unread',
  updateError: 'Failed to update notification',
  needsAction: 'Needs action',
  today: 'Today',
  yesterday: 'Yesterday',
  earlier: 'Earlier',
  updates: '{count} updates',
  allCaughtUp: 'You’re all caught up',
  showAll: 'Show all',
  noNotifications: 'No notifications yet',
  loading: 'Loading notifications',
  loadError: 'Couldn’t load notifications',
  refreshError: 'Couldn’t refresh. Showing earlier results.',
  // loading-text-allowed: default label, rendered sr-only beside a spinner
  loadingMore: 'Loading more…',
  noOlder: 'No older notifications',
  retry: 'Retry',
  viewAll: 'View all',
  viewDetails: 'View details',
  openIn: 'Open in {app}',
  opening: 'Opening…',
  actionError: 'Couldn’t complete that action',
  accept: 'Accept',
  decline: 'Decline',
  accepted: 'Joined',
  declined: 'Declined',
  scopeAll: 'All workspaces',
} as const;

export type NotificationLabels = Record<
  keyof typeof DEFAULT_NOTIFICATION_LABELS,
  string
>;

export const fillCount = (template: string, count: number) =>
  template.replace('{count}', count > 99 ? '99+' : String(count));

/** Message keys (under the root namespace) for each label. */
const KEYS: Record<keyof NotificationLabels, string[]> = {
  notifications: ['notifications.notifications'],
  unread: ['notifications.unread'],
  all: ['notifications.all'],
  unreadCount: ['notifications.popover-unread-count'],
  markAllRead: ['notifications.mark-all-read'],
  markedAllRead: ['notifications.marked-all-read'],
  markAllError: ['notifications.mark-all-error'],
  undo: ['notifications.undo', 'common.undo'],
  undoDone: ['notifications.undo-done'],
  undoPartial: ['notifications.undo-partial'],
  undoError: ['notifications.undo-error'],
  markAsRead: ['notifications.mark-as-read'],
  markAsUnread: ['notifications.mark-as-unread'],
  markedAsRead: ['notifications.marked-as-read'],
  markedAsUnread: ['notifications.marked-as-unread'],
  updateError: ['notifications.update-error'],
  needsAction: ['notifications.needs-action'],
  today: ['notifications.today'],
  yesterday: ['notifications.yesterday'],
  earlier: ['notifications.earlier'],
  updates: ['notifications.popover-updates'],
  allCaughtUp: ['notifications.all-caught-up'],
  showAll: ['notifications.show-all'],
  noNotifications: ['notifications.no-notifications'],
  loading: ['notifications.loading'],
  loadError: ['notifications.load-error'],
  refreshError: ['notifications.refresh-error'],
  loadingMore: ['notifications.loading-more'],
  noOlder: ['notifications.no-older'],
  retry: ['common.retry'],
  viewAll: ['notifications.view-all'],
  openIn: ['notifications.open-in'],
  viewDetails: ['notifications.view-details'],
  opening: ['notifications.opening'],
  actionError: ['notifications.action-error'],
  accept: ['notifications.accept'],
  decline: ['notifications.decline'],
  accepted: [
    'notifications.workspace-invite-accepted',
    'workspace-invitation.accept-success',
  ],
  declined: [
    'notifications.workspace-invite-declined',
    'workspace-invitation.decline-success',
  ],
  scopeAll: ['notifications.scope-all'],
};

/** Minimal shape shared by next-intl's server and client translators. */
export interface NotificationTranslator {
  has(key: any): boolean;
  raw(key: any): any;
}

/**
 * Fills a label set from a root-namespace translator. Raw messages keep their
 * `{count}`-style placeholders; a missing key keeps the English default so an
 * app bundle that has not shipped a key still renders.
 */
export function labelsFromTranslator<L extends Record<string, string>>(
  defaults: L,
  keys: Record<keyof L, string[]>,
  t: NotificationTranslator
): L {
  const labels = { ...defaults };
  for (const name of Object.keys(keys) as (keyof L)[]) {
    const key = keys[name].find((candidate) => t.has(candidate));
    const value = key ? t.raw(key) : undefined;
    if (typeof value === 'string') labels[name] = value as L[keyof L];
  }
  return labels;
}

/** Labels for the shared notification popover. */
export function notificationLabelsFrom(
  t: NotificationTranslator
): NotificationLabels {
  return labelsFromTranslator<NotificationLabels>(
    DEFAULT_NOTIFICATION_LABELS,
    KEYS,
    t
  );
}

/** Same as `notificationLabelsFrom` for hosts with a plain message object. */
export function notificationLabelsFromMessages(
  messages: Record<string, unknown>
): NotificationLabels {
  const lookup = (key: string) =>
    key
      .split('.')
      .reduce<unknown>(
        (node, part) =>
          node && typeof node === 'object'
            ? (node as Record<string, unknown>)[part]
            : undefined,
        messages
      );
  return notificationLabelsFrom({
    has: (key: string) => typeof lookup(key) === 'string',
    raw: lookup,
  });
}
