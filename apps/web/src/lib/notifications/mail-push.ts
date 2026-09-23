import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';

interface MailNotification {
  id: string;
  type: string;
  user_id?: string | null;
  ws_id?: string | null;
  scope?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  data: Record<string, unknown> | null;
}
interface MailBatch {
  channel: string;
  user_id: string | null;
  ws_id: string | null;
}

export function isPersonalMailPush(
  notification: MailNotification,
  batch?: MailBatch
): boolean {
  return (
    !!batch &&
    batch.channel === 'push' &&
    batch.ws_id === null &&
    notification.type === 'mail_received' &&
    notification.scope === 'user' &&
    notification.ws_id === null &&
    !!notification.user_id &&
    batch.user_id === notification.user_id &&
    notification.entity_type === 'mail_message' &&
    notification.data?.userId === notification.user_id &&
    notification.data?.messageId === notification.entity_id
  );
}

export async function getMailPushSkipReason(
  admin: {
    schema: (schema: 'private') => {
      rpc: (
        name: 'can_deliver_mail_notification',
        args: { p_notification_id: string }
      ) => PromiseLike<{ data?: unknown; error?: unknown }>;
    };
  },
  notification: MailNotification,
  batch: MailBatch
): Promise<string | null> {
  if (notification.type !== 'mail_received') {
    // A mixed personal batch must not bypass the root-only rollout restriction.
    const workspaceId =
      notification.ws_id ??
      notification.entity_id ??
      notification.data?.workspace_id;
    return workspaceId === ROOT_WORKSPACE_ID ? null : 'restricted_workspace';
  }
  if (!isPersonalMailPush(notification, batch))
    return 'invalid_mail_push_target';
  const { data, error } = await admin
    .schema('private')
    .rpc('can_deliver_mail_notification', {
      p_notification_id: notification.id,
    });
  if (error) throw error;
  return data === true ? null : 'mail_access_or_preferences_changed';
}
