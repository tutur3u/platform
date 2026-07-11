import type {
  ListMailMessagesParams,
  MailLabel,
  MailMessageDetail,
  MailRouteContext,
} from '../types';
import { requireMailboxAccess } from './bootstrap';
import { queryMailMessageRows } from './search';
import { type AnyRecord, privateTable, toLabel, toRecipient } from './shared';

export async function getStatesByMessageId(
  admin: AnyRecord,
  messageIds: string[],
  userId: string
): Promise<Map<string, AnyRecord>> {
  if (messageIds.length === 0) return new Map<string, AnyRecord>();

  const { data, error } = await privateTable(admin, 'mail_message_user_state')
    .select('*')
    .eq('user_id', userId)
    .in('message_id', messageIds);

  if (error) {
    throw new Error(`Failed to load message state: ${error.message}`);
  }

  return new Map<string, AnyRecord>(
    (data ?? []).map((row: AnyRecord) => [row.message_id, row])
  );
}

export async function getLabelsByMessageId(
  admin: AnyRecord,
  messageIds: string[]
) {
  if (messageIds.length === 0) return new Map<string, MailLabel[]>();

  const { data: links, error: linkError } = await privateTable(
    admin,
    'mail_message_labels'
  )
    .select('message_id, label_id')
    .in('message_id', messageIds);

  if (linkError) {
    throw new Error(`Failed to load message labels: ${linkError.message}`);
  }

  const labelIds = [
    ...new Set((links ?? []).map((row: AnyRecord) => row.label_id)),
  ];

  if (labelIds.length === 0) return new Map<string, MailLabel[]>();

  const { data: labels, error: labelError } = await privateTable(
    admin,
    'mail_labels'
  )
    .select('*')
    .in('id', labelIds);

  if (labelError) {
    throw new Error(`Failed to load labels: ${labelError.message}`);
  }

  const labelById = new Map<string, MailLabel>(
    (labels ?? []).map((row: AnyRecord) => [row.id, toLabel(row)])
  );
  const labelsByMessage = new Map<string, MailLabel[]>();

  for (const link of links ?? []) {
    const label = labelById.get(link.label_id);
    if (!label) continue;
    const existing = labelsByMessage.get(link.message_id) ?? [];
    existing.push(label);
    labelsByMessage.set(link.message_id, existing);
  }

  return labelsByMessage;
}

export function rowToSummary({
  labels,
  row,
  state,
}: {
  labels: MailLabel[];
  row: AnyRecord;
  state?: AnyRecord;
}) {
  return {
    bodyText: row.body_text ?? null,
    createdAt: row.created_at,
    fromAddress: row.from_address,
    fromName: row.from_name ?? null,
    hasAttachments: row.has_attachments,
    id: row.id,
    labels,
    mailboxId: row.mailbox_id,
    receivedAt: row.received_at ?? null,
    sentAt: row.sent_at ?? null,
    snippet: row.snippet ?? null,
    starred: Boolean(state?.starred_at),
    status: row.status,
    subject: row.subject || '(no subject)',
    threadId: row.thread_id ?? null,
    unread: row.direction === 'inbound' && !state?.read_at,
  };
}

export async function listMailMessages({
  ctx,
  mailboxId,
  params,
}: {
  ctx: MailRouteContext;
  mailboxId: string;
  params: ListMailMessagesParams;
}) {
  const access = await requireMailboxAccess(ctx, mailboxId);
  if (!access) return null;

  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(Math.max(1, params.pageSize ?? 40), 100);
  const { rows, total } = await queryMailMessageRows({
    admin: access.admin,
    mailboxId,
    params,
    userId: ctx.user.id,
  });
  const messageIds = rows.map((row: AnyRecord) => row.id);
  const states = await getStatesByMessageId(
    access.admin,
    messageIds,
    ctx.user.id
  );
  const labelsByMessageId = await getLabelsByMessageId(
    access.admin,
    messageIds
  );
  return {
    messages: rows.map((row: AnyRecord) =>
      rowToSummary({
        labels: labelsByMessageId.get(row.id) ?? [],
        row,
        state: states.get(row.id),
      })
    ),
    pagination: {
      page,
      pageSize,
      total,
    },
  };
}

export async function getMailMessage({
  ctx,
  mailboxId,
  messageId,
}: {
  ctx: MailRouteContext;
  mailboxId: string;
  messageId: string;
}): Promise<MailMessageDetail | null> {
  const access = await requireMailboxAccess(ctx, mailboxId);
  if (!access) return null;

  const { data: row, error } = await privateTable(access.admin, 'mail_messages')
    .select('*')
    .eq('mailbox_id', mailboxId)
    .eq('id', messageId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load mail message: ${error.message}`);
  }

  if (!row) return null;

  return hydrateMailMessage({ admin: access.admin, ctx, row });
}

export async function hydrateMailMessage({
  admin,
  ctx,
  row,
}: {
  admin: AnyRecord;
  ctx: MailRouteContext;
  row: AnyRecord;
}): Promise<MailMessageDetail> {
  const messageId = row.id as string;
  const mailboxId = row.mailbox_id as string;

  const [states, labelsByMessageId, recipients, attachments] =
    await Promise.all([
      getStatesByMessageId(admin, [messageId], ctx.user.id),
      getLabelsByMessageId(admin, [messageId]),
      listRecipients(admin, messageId),
      listAttachments(admin, ctx.normalizedWsId, mailboxId, messageId),
    ]);

  const summary = rowToSummary({
    labels: labelsByMessageId.get(messageId) ?? [],
    row,
    state: states.get(messageId),
  });

  return {
    ...summary,
    attachments,
    bodyHtml: row.body_html ?? null,
    deliveryRoute: row.delivery_route ?? null,
    envelopeFrom: row.envelope_from ?? null,
    envelopeTo: row.envelope_to ?? null,
    inReplyTo: row.in_reply_to ?? null,
    internetMessageId: row.internet_message_id ?? null,
    observedRecipient: row.observed_recipient ?? null,
    recipients,
    references: row.references_headers ?? [],
    safeHeaders: await getSafeHeaders(admin, row.raw_message_id),
    sanitizedHtml: row.sanitized_html ?? null,
  };
}

async function getSafeHeaders(admin: AnyRecord, rawMessageId?: string | null) {
  if (!rawMessageId) return {};
  const { data, error } = await privateTable(admin, 'mail_raw_messages')
    .select('raw_headers')
    .eq('id', rawMessageId)
    .maybeSingle();
  if (error)
    throw new Error(`Failed to load message headers: ${error.message}`);
  const headers = (data?.raw_headers ?? {}) as Record<string, unknown>;
  const allowed = new Set([
    'date',
    'from',
    'in-reply-to',
    'message-id',
    'reply-to',
    'subject',
    'to',
  ]);
  return Object.fromEntries(
    Object.entries(headers)
      .filter(
        ([key, value]) =>
          allowed.has(key.toLowerCase()) && typeof value === 'string'
      )
      .map(([key, value]) => [key, value as string])
  );
}

async function listRecipients(admin: AnyRecord, messageId: string) {
  const { data, error } = await privateTable(admin, 'mail_recipients')
    .select('*')
    .eq('message_id', messageId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to load recipients: ${error.message}`);
  }

  return (data ?? []).map(toRecipient);
}

async function listAttachments(
  admin: AnyRecord,
  wsId: string,
  mailboxId: string,
  messageId: string
) {
  const { data, error } = await privateTable(admin, 'mail_attachments')
    .select('*')
    .eq('message_id', messageId)
    .order('filename', { ascending: true });

  if (error) {
    throw new Error(`Failed to load attachments: ${error.message}`);
  }

  return (data ?? []).map((row: AnyRecord) => ({
    contentId: row.content_id ?? null,
    contentType: row.content_type,
    disposition: row.disposition,
    filename: row.filename,
    id: row.id,
    protectedUrl:
      row.storage_bucket || row.stored_object_id
        ? `/api/v1/workspaces/${wsId}/mail/mailboxes/${mailboxId}/messages/${messageId}/attachments/${row.id}`
        : null,
    sizeBytes: Number(row.size_bytes ?? 0),
  }));
}
