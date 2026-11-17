import {
  DEFAULT_NOTIFICATION_LABELS,
  labelsFromTranslator,
  type NotificationLabels,
  type NotificationTranslator,
  notificationLabelsFrom,
} from './notification-labels';

// Labels the full notifications page adds to the popover contract. Templates
// use `{count}` and `{section}` placeholders that the client fills in.
export const DEFAULT_NOTIFICATION_PAGE_LABELS = {
  selectAll: 'Select all',
  selectRow: 'Select',
  selectedCount: '{count} selected',
  clearSelection: 'Clear selection',
  markSelectionRead: 'Mark as read',
  markSelectionUnread: 'Mark as unread',
  markedSelectionRead: 'Marked {count} as read',
  markedSelectionUnread: 'Marked {count} as unread',
  markSectionRead: 'Mark {section} as read',
  groupBy: 'Group by',
  groupTime: 'Time',
  groupApp: 'App',
  tasks: 'Tasks',
  mail: 'Mail',
  chat: 'Chat',
  track: 'Track',
  workspaces: 'Workspaces',
  account: 'Account',
  settings: 'Notification settings',
  shortcuts: 'Keyboard shortcuts',
  shortcutMove: 'Move between notifications',
  shortcutOpen: 'Open',
  shortcutToggle: 'Mark as read or unread',
  shortcutSelect: 'Select',
  shortcutRange: 'Select a range',
  shortcutClear: 'Clear selection',
  shortcutHelp: 'Show shortcuts',
} as const;

export type NotificationPageOnlyLabels = Record<
  keyof typeof DEFAULT_NOTIFICATION_PAGE_LABELS,
  string
>;

export type NotificationPageLabels = NotificationLabels &
  NotificationPageOnlyLabels;

const k = (name: string) => [`notifications.page-${name}`];

const KEYS: Record<keyof NotificationPageOnlyLabels, string[]> = {
  selectAll: k('select-all'),
  selectRow: k('select-row'),
  selectedCount: k('selected-count'),
  clearSelection: k('clear-selection'),
  markSelectionRead: ['notifications.mark-as-read'],
  markSelectionUnread: ['notifications.mark-as-unread'],
  markedSelectionRead: k('marked-selection-read'),
  markedSelectionUnread: k('marked-selection-unread'),
  markSectionRead: k('mark-section-read'),
  groupBy: k('group-by'),
  groupTime: k('group-time'),
  groupApp: k('group-app'),
  tasks: k('app-tasks'),
  mail: k('app-mail'),
  chat: k('app-chat'),
  track: k('app-track'),
  workspaces: k('app-workspaces'),
  account: k('app-account'),
  settings: k('settings'),
  shortcuts: k('shortcuts'),
  shortcutMove: k('shortcut-move'),
  shortcutOpen: k('shortcut-open'),
  shortcutToggle: k('shortcut-toggle'),
  shortcutSelect: k('shortcut-select'),
  shortcutRange: k('shortcut-range'),
  shortcutClear: k('shortcut-clear'),
  shortcutHelp: k('shortcut-help'),
};

export const DEFAULT_NOTIFICATION_PAGE_ALL_LABELS: NotificationPageLabels = {
  ...DEFAULT_NOTIFICATION_LABELS,
  ...DEFAULT_NOTIFICATION_PAGE_LABELS,
};

/** Popover labels plus the page's own, from a root-namespace translator. */
export function notificationPageLabelsFrom(
  t: NotificationTranslator
): NotificationPageLabels {
  return {
    ...notificationLabelsFrom(t),
    ...labelsFromTranslator<NotificationPageOnlyLabels>(
      DEFAULT_NOTIFICATION_PAGE_LABELS,
      KEYS,
      t
    ),
  };
}

export const fillTemplate = (
  template: string,
  values: Record<string, string | number>
) =>
  Object.entries(values).reduce(
    (text, [key, value]) => text.replace(`{${key}}`, String(value)),
    template
  );
