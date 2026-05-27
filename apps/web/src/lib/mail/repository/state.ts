import type { UpdateMailMessageStatePayload } from '@tuturuuu/internal-api';
import type { MailRouteContext } from '../types';
import { requireMailboxAccess } from './bootstrap';
import { getMailMessage } from './messages';
import { type AnyRecord, privateTable } from './shared';

export async function updateMailMessageState({
  ctx,
  mailboxId,
  messageId,
  payload,
}: {
  ctx: MailRouteContext;
  mailboxId: string;
  messageId: string;
  payload: UpdateMailMessageStatePayload;
}) {
  const access = await requireMailboxAccess(ctx, mailboxId);
  if (!access) return null;

  const now = new Date().toISOString();
  const statePatch: AnyRecord = {
    mailbox_id: mailboxId,
    message_id: messageId,
    user_id: ctx.user.id,
  };

  if (payload.action === 'mark_read') statePatch.read_at = now;
  if (payload.action === 'mark_unread') statePatch.read_at = null;
  if (payload.action === 'star') statePatch.starred_at = now;
  if (payload.action === 'unstar') statePatch.starred_at = null;
  if (payload.action === 'archive') statePatch.archived_at = now;
  if (payload.action === 'trash') statePatch.trashed_at = now;
  if (payload.action === 'restore') {
    statePatch.archived_at = null;
    statePatch.trashed_at = null;
  }

  const { error } = await privateTable(
    access.admin,
    'mail_message_user_state'
  ).upsert(statePatch, { onConflict: 'message_id,user_id' });

  if (error) {
    throw new Error(`Failed to update message state: ${error.message}`);
  }

  return getMailMessage({ ctx, mailboxId, messageId });
}
