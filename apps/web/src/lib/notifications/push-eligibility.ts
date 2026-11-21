import type {
  EmailEligibilityClient,
  EmailNotificationTarget,
} from './email-eligibility';

export const PUSH_PREFERENCES_DISABLED_SKIP_REASON =
  'skipped: push_preferences_disabled';

/**
 * Rechecks push settings when an immediate push is sent, so an opt-out made
 * after the event still holds. The account switch and the event setting are
 * read in parallel. Mail push has its own eligibility RPC with the same checks.
 */
export async function getPushPreferenceSkipReason(
  admin: EmailEligibilityClient,
  notification: EmailNotificationTarget
): Promise<string | null> {
  if (!notification.user_id || notification.type === 'mail_received')
    return null;
  const event = notification.type || notification.code;
  if (!event || typeof admin.rpc !== 'function') {
    throw new Error('Notification push preference lookup unavailable');
  }
  const rpc = admin.rpc as (
    name: string,
    args: Record<string, string | null>
  ) => PromiseLike<{ data: unknown; error: unknown }>;
  const scope = notification.scope || 'workspace';
  const checks = [
    { event: 'push_notifications', scope: 'user', wsId: null },
    { event, scope, wsId: notification.ws_id ?? null },
  ];
  const results = await Promise.all(
    checks.map((check) =>
      rpc.call(admin, 'should_send_notification', {
        p_user_id: notification.user_id!,
        p_event_type: check.event,
        p_channel: 'push',
        p_scope: check.scope,
        p_ws_id: check.wsId,
      })
    )
  );
  for (const { data, error } of results) {
    if (error || typeof data !== 'boolean') {
      throw new Error('Failed to verify notification push preferences');
    }
    if (!data) return PUSH_PREFERENCES_DISABLED_SKIP_REASON;
  }
  return null;
}

/**
 * A push digest sends its newest notification, so one settings recheck per
 * digest bounds the cost while still honoring an opt-out made after enqueue.
 */
export async function getPushDigestSkipReason(
  admin: EmailEligibilityClient,
  deviceCount: number,
  newest: EmailNotificationTarget,
  noDevicesReason: string
): Promise<string | null> {
  if (deviceCount === 0) return noDevicesReason;
  return getPushPreferenceSkipReason(admin, newest);
}
