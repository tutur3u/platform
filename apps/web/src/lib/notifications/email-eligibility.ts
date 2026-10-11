import { isEmail, isValidTuturuuuEmail } from '@tuturuuu/utils/email/client';

export type EmailEligibilityClient = {
  rpc?: unknown;
  auth?: {
    admin: {
      getUserById: (id: string) => PromiseLike<{
        data: { user: { email?: string; email_confirmed_at?: string } | null };
        error: unknown;
      }>;
    };
  };
};

export type EmailNotificationTarget = {
  user_id?: string | null;
  ws_id?: string | null;
  scope?: string | null;
  type?: string | null;
  code?: string | null;
};

// The existing RPC owns workspace overrides, account event fallback and defaults.
// Account channel/category opt-outs are separate fences and cannot be overridden.
export async function getEmailPreferenceSkipReason(
  admin: EmailEligibilityClient,
  notification: EmailNotificationTarget
): Promise<string | null> {
  if (!notification.user_id) return null;
  const event = notification.type || notification.code;
  if (!event || typeof admin.rpc !== 'function') {
    throw new Error('Notification email preference lookup unavailable');
  }
  const rpc = admin.rpc as (
    name: string,
    args: Record<string, string | null>
  ) => PromiseLike<{ data: unknown; error: unknown }>;
  const scope = notification.scope || 'workspace';
  const checks = [
    { event: 'email_notifications', scope: 'user', wsId: null },
    ...(event === 'security_alert'
      ? [{ event: 'security_alerts', scope: 'user', wsId: null }]
      : scope === 'workspace'
        ? [{ event: 'workspace_activity', scope: 'user', wsId: null }]
        : []),
    { event, scope, wsId: notification.ws_id ?? null },
  ];
  for (const check of checks) {
    const { data, error } = await rpc.call(admin, 'should_send_notification', {
      p_user_id: notification.user_id,
      p_event_type: check.event,
      p_channel: 'email',
      p_scope: check.scope,
      p_ws_id: check.wsId,
    });
    if (error || typeof data !== 'boolean') {
      throw new Error('Failed to verify notification email preferences');
    }
    if (!data) return 'skipped: email_preferences_disabled';
  }
  return null;
}

export async function getEmailRecipientSkipDetail(
  admin: EmailEligibilityClient,
  notification: EmailNotificationTarget,
  email: string
): Promise<string | null> {
  if (!isEmail(email)) return 'invalid_recipient_email';
  // Preserve existing internal delivery, including email-only invitations.
  if (isValidTuturuuuEmail(email)) return null;
  if (!notification.user_id) return 'unverified_recipient_email';
  if (!admin.auth)
    throw new Error('Notification email verification unavailable');
  const { data, error } = await admin.auth.admin.getUserById(
    notification.user_id
  );
  if (error) throw new Error('Failed to verify notification email recipient');
  const user = data.user;
  return user?.email_confirmed_at &&
    user.email?.trim().toLowerCase() === email.trim().toLowerCase()
    ? null
    : 'unverified_recipient_email';
}
