import type {
  BulkUpdateMailThreadsPayload,
  ListMailThreadsParams,
  UpdateMailMessageStatePayload,
} from '@tuturuuu/internal-api';
import type {
  MailRouteContext,
  MailThread,
  MailThreadDetail,
  MailThreadSummary,
} from '../types';
import { requireMailboxAccess } from './bootstrap';
import {
  getLabelsByMessageId,
  getStatesByMessageId,
  hydrateMailMessage,
} from './messages';
import { bulkUpdateMail } from './organization';
import { queryMailMessageRows } from './search';
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

export async function listMailThreads({
  ctx,
  mailboxId,
  params,
}: {
  ctx: MailRouteContext;
  mailboxId: string;
  params: ListMailThreadsParams;
}) {
  const access = await requireMailboxAccess(ctx, mailboxId);
  if (!access) return null;
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(Math.max(1, params.pageSize ?? 40), 100);
  const { rows } = await queryMailMessageRows({
    admin: access.admin,
    mailboxId,
    params: { ...params, page: 1 },
    threadScan: true,
    userId: ctx.user.id,
  });
  const latestByThread = new Map<string, AnyRecord>();
  const participantsByThread = new Map<
    string,
    Map<string, { address: string; displayName: string | null }>
  >();
  const attachmentThreads = new Set<string>();
  for (const row of rows) {
    const threadId = row.thread_id as string | null;
    if (!threadId) continue;
    if (!latestByThread.has(threadId)) latestByThread.set(threadId, row);
    if (row.has_attachments) attachmentThreads.add(threadId);
    const participants =
      participantsByThread.get(threadId) ??
      new Map<string, { address: string; displayName: string | null }>();
    const address = String(row.from_address ?? '').toLowerCase();
    if (address && !participants.has(address)) {
      participants.set(address, {
        address,
        displayName: row.from_name ?? null,
      });
    }
    participantsByThread.set(threadId, participants);
  }
  const allThreadIds = [...latestByThread.keys()];
  const start = (page - 1) * pageSize;
  const threadIds = allThreadIds.slice(start, start + pageSize);
  if (threadIds.length === 0) {
    return {
      pagination: { page, pageSize, total: allThreadIds.length },
      threads: [],
    };
  }
  const messageIds = threadIds
    .map((threadId) => latestByThread.get(threadId)?.id as string | undefined)
    .filter((id): id is string => Boolean(id));
  const [{ data: threads, error }, states, labels] = await Promise.all([
    privateTable(access.admin, 'mail_threads')
      .select('*')
      .eq('mailbox_id', mailboxId)
      .in('id', threadIds),
    getStatesByMessageId(access.admin, messageIds, ctx.user.id),
    getLabelsByMessageId(access.admin, messageIds),
  ]);
  if (error) throw new Error(`Failed to list mail threads: ${error.message}`);
  const threadById = new Map(
    (threads ?? []).map((thread: AnyRecord) => [thread.id as string, thread])
  );
  const summaries: MailThreadSummary[] = threadIds.flatMap((threadId) => {
    const thread = threadById.get(threadId);
    const message = latestByThread.get(threadId);
    if (!thread || !message) return [];
    const state = states.get(message.id);
    return [
      {
        ...toThread(thread),
        hasAttachments: attachmentThreads.has(threadId),
        labels: labels.get(message.id) ?? [],
        latestMessageId: message.id,
        latestSnippet: message.snippet ?? message.body_text ?? null,
        participants: [...(participantsByThread.get(threadId)?.values() ?? [])],
        starred: Boolean(state?.starred_at),
      },
    ];
  });
  return {
    pagination: { page, pageSize, total: allThreadIds.length },
    threads: summaries,
  };
}

export async function bulkUpdateMailThreads({
  ctx,
  mailboxId,
  payload,
}: {
  ctx: MailRouteContext;
  mailboxId: string;
  payload: BulkUpdateMailThreadsPayload;
}) {
  const access = await requireMailboxAccess(ctx, mailboxId);
  if (!access) return null;
  const { data, error } = await privateTable(access.admin, 'mail_messages')
    .select('id')
    .eq('mailbox_id', mailboxId)
    .in('thread_id', payload.threadIds)
    .limit(500);
  if (error)
    throw new Error(`Failed to load thread messages: ${error.message}`);
  return bulkUpdateMail({
    ctx,
    mailboxId,
    payload: {
      action: payload.action,
      labelId: payload.labelId,
      messageIds: (data ?? []).map((row: AnyRecord) => row.id),
    },
  });
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
