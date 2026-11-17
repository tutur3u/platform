import type { AnyRecord } from './shared';

/** Atomic, actor-scoped movement after mailbox-admin authorization. */
export async function moveBlockedMailAndConsumeNotifications({
  admin,
  mailboxId,
  userId,
  labelId,
  messageIds,
}: {
  admin: AnyRecord;
  mailboxId: string;
  userId: string;
  labelId: string;
  messageIds: string[];
}) {
  const ids = [...new Set(messageIds)].sort();
  if (!ids.length) return 0;
  if (ids.length > 500) throw new Error('Notification movement limit exceeded');
  const { data, error } = await admin
    .schema('private')
    .rpc('move_mail_to_blocked_and_consume_notifications', {
      p_mailbox_id: mailboxId,
      p_user_id: userId,
      p_label_id: labelId,
      p_message_ids: ids,
    });
  if (error || data !== ids.length) {
    throw new Error('Failed to move sender mail and consume notifications');
  }
  return data as number;
}
