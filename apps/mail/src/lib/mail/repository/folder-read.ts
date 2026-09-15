import type { MailRouteContext } from '../types';
import { requireMailboxAccess } from './bootstrap';
import { getStatesByMessageId } from './messages';
import { type AnyRecord, mailMessageTable, privateTable } from './shared';

const BATCH_SIZE = 250;

export function isUnreadInFolder(
  message: AnyRecord,
  state: AnyRecord | undefined,
  folder: 'inbox' | 'archive'
) {
  if (message.direction !== 'inbound' || state?.read_at || state?.trashed_at)
    return false;
  if (folder === 'archive') return Boolean(state?.archived_at);
  return (
    !state?.archived_at &&
    message.status !== 'draft' &&
    message.status !== 'quarantined'
  );
}

/** Keyset pagination scans a stable message set without skipping rows as read state changes. */
export async function markMailFolderRead({
  ctx,
  mailboxId,
  payload,
}: {
  ctx: MailRouteContext;
  mailboxId: string;
  payload: { folder: 'inbox' | 'archive'; cursor?: string; before?: string };
}) {
  const access = await requireMailboxAccess(ctx, mailboxId);
  if (!access) return null;
  const now = new Date().toISOString();
  const before = payload.before && payload.before < now ? payload.before : now;
  let query = mailMessageTable(access, ctx)
    .select('id,direction,status')
    .eq('mailbox_id', mailboxId)
    .eq('direction', 'inbound')
    .lte('created_at', before)
    .order('id')
    .limit(BATCH_SIZE);
  if (payload.cursor) query = query.gt('id', payload.cursor);
  const { data, error } = await query;
  if (error)
    throw new Error(`Failed to load folder messages: ${error.message}`);
  const messages: AnyRecord[] = data ?? [];
  const states = await getStatesByMessageId(
    access.admin,
    messages.map((message) => message.id),
    ctx.user.id
  );
  const unread = messages.filter((message) =>
    isUnreadInFolder(message, states.get(message.id), payload.folder)
  );
  if (unread.length) {
    const { error: updateError } = await privateTable(
      access.admin,
      'mail_message_user_state'
    ).upsert(
      unread.map((message) => ({
        mailbox_id: mailboxId,
        message_id: message.id,
        user_id: ctx.user.id,
        read_at: now,
      })),
      { onConflict: 'message_id,user_id' }
    );
    if (updateError)
      throw new Error(`Failed to mark folder read: ${updateError.message}`);
  }
  return {
    updated: unread.length,
    before,
    nextCursor:
      messages.length === BATCH_SIZE ? (messages.at(-1)!.id as string) : null,
  };
}
