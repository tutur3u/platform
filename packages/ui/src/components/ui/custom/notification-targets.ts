import {
  getLaunchableApp,
  resolveLaunchableAppUrl,
} from '@tuturuuu/utils/launchable-apps';

/**
 * Where an app-sourced notification opens: the exact item in its owning app.
 *
 * Targets are built only from row identifiers (UUID-checked) and the
 * first-party app registry, never from a stored URL, so a notification cannot
 * steer navigation to another origin. The owning app still authorizes the
 * item when it loads; a stale or revoked item shows that app's not-found or
 * access state.
 */
export type NotificationTargetApp = 'tasks' | 'mail' | 'chat' | 'track';

export type NotificationTarget =
  | { kind: 'task'; app: 'tasks'; taskId: string; wsId?: string; href: string }
  | { kind: 'link'; app: NotificationTargetApp; href: string };

export interface NotificationTargetInput {
  type?: string | null;
  ws_id?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  data?: Record<string, unknown> | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const uuid = (value: unknown) =>
  typeof value === 'string' && UUID.test(value) ? value : null;

/** Mail lives in each user's personal workspace. */
const MAIL_WORKSPACE = 'personal';

function appUrl(
  slug: NotificationTargetApp,
  path: string,
  searchParams?: Record<string, string>,
  currentOrigin?: string
) {
  const app = getLaunchableApp(slug);
  if (!app) return null;
  return resolveLaunchableAppUrl({ app, path, searchParams, currentOrigin });
}

export function resolveNotificationTarget(
  notification: NotificationTargetInput,
  {
    routeWsId,
    currentOrigin,
  }: { routeWsId?: string; currentOrigin?: string } = {}
): NotificationTarget | null {
  const data = notification.data ?? {};
  const wsId = uuid(notification.ws_id) ?? uuid(routeWsId) ?? undefined;
  const entityId = uuid(notification.entity_id);

  if (notification.entity_type === 'task' && entityId) {
    if (!wsId) return null;
    const href = appUrl(
      'tasks',
      `/${wsId}/tasks/${entityId}`,
      undefined,
      currentOrigin
    );
    return href
      ? { kind: 'task', app: 'tasks', taskId: entityId, wsId, href }
      : null;
  }

  if (notification.type === 'mail_received') {
    const mailboxId = uuid(data.mailboxId);
    const threadId = uuid(data.threadId);
    if (!mailboxId || !threadId) return null;
    const href = appUrl(
      'mail',
      `/${MAIL_WORKSPACE}`,
      { mailbox: mailboxId, thread: threadId },
      currentOrigin
    );
    return href ? { kind: 'link', app: 'mail', href } : null;
  }

  if (notification.entity_type === 'chat_conversation') {
    const conversationId =
      entityId ?? uuid(data.conversation_id) ?? uuid(data.conversationId);
    if (!conversationId || !wsId) return null;
    const href = appUrl('chat', `/${wsId}`, { conversationId }, currentOrigin);
    return href ? { kind: 'link', app: 'chat', href } : null;
  }

  if (notification.entity_type === 'time_tracking_request' && entityId) {
    if (!wsId) return null;
    const href = appUrl('track', `/${wsId}/requests`, undefined, currentOrigin);
    return href ? { kind: 'link', app: 'track', href } : null;
  }

  return null;
}

/** Display name of the app a target opens in, from the app registry. */
export function notificationTargetAppName(target: NotificationTarget | null) {
  return target ? (getLaunchableApp(target.app)?.title ?? null) : null;
}

/** Full navigation to another app's page. */
export function navigateToNotificationTarget(href: string) {
  window.location.assign(href);
}
