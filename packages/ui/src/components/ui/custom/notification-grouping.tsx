import type { Notification } from '@tuturuuu/ui/hooks/use-notifications';

export type NotificationSectionKey =
  | 'needsAction'
  | 'today'
  | 'yesterday'
  | 'earlier';

/** One visible row: the newest event plus older events on the same entity. */
export interface NotificationStack {
  lead: Notification;
  rest: Notification[];
  /** Ids the row's read toggle changes. */
  ids: string[];
  unread: boolean;
}

export interface NotificationSection {
  key: NotificationSectionKey;
  stacks: NotificationStack[];
}

const ORDER: NotificationSectionKey[] = [
  'needsAction',
  'today',
  'yesterday',
  'earlier',
];

/** An unresolved workspace invite is the only actionable type today. */
export const needsAction = (n: Notification) =>
  n.type === 'workspace_invite' && !n.data?.action_taken;

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

function sectionOf(n: Notification, today: number): NotificationSectionKey {
  if (needsAction(n)) return 'needsAction';
  const day = startOfDay(new Date(n.created_at));
  if (day >= today) return 'today';
  if (day >= today - 86_400_000) return 'yesterday';
  return 'earlier';
}

const entityKey = (n: Notification) =>
  n.entity_type && n.entity_id && !needsAction(n)
    ? `${n.type}:${n.entity_type}:${n.entity_id}`
    : null;

/**
 * Groups notifications into ordered sections in server order, collapsing
 * repeated events of one type on one entity inside a section into a stack.
 */
function groupInto<K extends string>(
  notifications: Notification[],
  order: readonly K[],
  sectionOf: (n: Notification) => K
): { key: K; stacks: NotificationStack[] }[] {
  const sections = new Map<K, NotificationStack[]>();
  const stacksByEntity = new Map<string, NotificationStack>();
  for (const n of notifications) {
    const section = sectionOf(n);
    const key = entityKey(n);
    const stackKey = key ? `${section}|${key}` : null;
    const existing = stackKey ? stacksByEntity.get(stackKey) : undefined;
    if (existing) {
      existing.rest.push(n);
      existing.ids.push(n.id);
      existing.unread ||= !n.read_at;
      continue;
    }
    const stack: NotificationStack = {
      lead: n,
      rest: [],
      ids: [n.id],
      unread: !n.read_at,
    };
    if (stackKey) stacksByEntity.set(stackKey, stack);
    const list = sections.get(section) ?? [];
    list.push(stack);
    sections.set(section, list);
  }
  return order.flatMap((key) => {
    const stacks = sections.get(key);
    return stacks?.length ? [{ key, stacks }] : [];
  });
}

/** Needs action, then Today, Yesterday and Earlier by the viewer's local day. */
export function groupNotifications(
  notifications: Notification[],
  now: Date = new Date()
): NotificationSection[] {
  const today = startOfDay(now);
  return groupInto(notifications, ORDER, (n) => sectionOf(n, today));
}

/** The first-party app a notification belongs to, for grouping by app. */
export type NotificationAppKey =
  | 'tasks'
  | 'mail'
  | 'chat'
  | 'track'
  | 'workspaces'
  | 'account';

export type NotificationAppSectionKey = 'needsAction' | NotificationAppKey;

const APP_ORDER: NotificationAppSectionKey[] = [
  'needsAction',
  'tasks',
  'mail',
  'chat',
  'track',
  'workspaces',
  'account',
];

export function notificationApp(n: Notification): NotificationAppKey {
  if (
    n.entity_type === 'task' ||
    n.type.startsWith('task_') ||
    n.type === 'deadline_reminder'
  )
    return 'tasks';
  if (n.type.startsWith('mail_')) return 'mail';
  if (n.entity_type === 'chat_conversation' || n.type.startsWith('chat_'))
    return 'chat';
  if (
    n.entity_type === 'time_tracking_request' ||
    n.type.startsWith('time_tracking_')
  )
    return 'track';
  if (n.type.startsWith('workspace_')) return 'workspaces';
  return 'account';
}

/** Needs action first, then one section per app in a fixed order. */
export function groupNotificationsByApp(
  notifications: Notification[]
): { key: NotificationAppSectionKey; stacks: NotificationStack[] }[] {
  return groupInto(notifications, APP_ORDER, (n) =>
    needsAction(n) ? 'needsAction' : notificationApp(n)
  );
}
