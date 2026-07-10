import type { UpdateMailMessageStatePayload } from '@tuturuuu/internal-api';
import type { MailRouteContext, MailThread, MailThreadDetail } from '../types';
import { requireMailboxAccess } from './bootstrap';
import { hydrateMailMessage } from './messages';
import { type AnyRecord, privateTable } from './shared';

function toThread(row: AnyRecord): MailThread {
  return {
    id: row.id,
    lastMessageAt: row.last_message_at ?? null,
    mailboxId: row.mailbox_id,
    messageCount: Number(row.message_count ?? 0),
    status: row.status,
    subject: row.subject || '(no subject)',
    unreadCount: Number(row.unread_count ?? 0),
  };
}

async function loadThread(
  admin: AnyRecord,
  mailboxId: string,
  threadId: string
) {
  const { data, error } = await privateTable(admin, 'mail_threads')
    .select('*')
    .eq('id', threadId)
    .eq('mailbox_id', mailboxId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load mail thread: ${error.message}`);
  return data;
}

export async function getMailThread({
  ctx,
  mailboxId,
  threadId,
}: {
  ctx: MailRouteContext;
  mailboxId: string;
  threadId: string;
}): Promise<MailThreadDetail | null> {
  const access = await requireMailboxAccess(ctx, mailboxId);
  if (!access) return null;
  const thread = await loadThread(access.admin, mailboxId, threadId);
  if (!thread) return null;

  const { data: rows, error } = await privateTable(
    access.admin,
    'mail_messages'
  )
    .select('*')
    .eq('mailbox_id', mailboxId)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error)
    throw new Error(`Failed to load thread messages: ${error.message}`);

  return {
    messages: await Promise.all(
      (rows ?? []).map((row: AnyRecord) =>
        hydrateMailMessage({ admin: access.admin, ctx, row })
      )
    ),
    thread: toThread(thread),
  };
}

export async function updateMailThreadState({
  ctx,
  mailboxId,
  payload,
  threadId,
}: {
  ctx: MailRouteContext;
  mailboxId: string;
  payload: UpdateMailMessageStatePayload;
  threadId: string;
}) {
  const access = await requireMailboxAccess(ctx, mailboxId);
  if (!access) return null;
  const thread = await loadThread(access.admin, mailboxId, threadId);
  if (!thread) return null;

  const { data: messages, error } = await privateTable(
    access.admin,
    'mail_messages'
  )
    .select('id')
    .eq('mailbox_id', mailboxId)
    .eq('thread_id', threadId)
    .limit(200);
  if (error)
    throw new Error(`Failed to load thread messages: ${error.message}`);

  const now = new Date().toISOString();
  const statePatch: AnyRecord = {};
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

  const rows = (messages ?? []).map((message: AnyRecord) => ({
    ...statePatch,
    mailbox_id: mailboxId,
    message_id: message.id,
    user_id: ctx.user.id,
  }));
  if (rows.length > 0) {
    const { error: updateError } = await privateTable(
      access.admin,
      'mail_message_user_state'
    ).upsert(rows, { onConflict: 'message_id,user_id' });
    if (updateError) {
      throw new Error(`Failed to update thread state: ${updateError.message}`);
    }
  }

  return getMailThread({ ctx, mailboxId, threadId });
}
