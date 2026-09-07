import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Address, Email } from 'postal-mime';
import {
  createSnippet,
  sanitizeMailHtml,
  stripHtml,
} from '../src/lib/mail/html';
import {
  deterministicUuid,
  flattenAddresses,
  mailboxAddress,
} from '../src/lib/mail/import/google-takeout';
import type { AnyRecord } from '../src/lib/mail/repository/shared';

export type StoredObjectRow = {
  bucket_name: string;
  content_id?: string | null;
  content_disposition?: string | null;
  content_type: string;
  filename?: string | null;
  id: string;
  mailbox_id: string;
  message_id: string | null;
  object_key: string;
  object_kind: 'attachment' | 'raw_mime';
  provider: 'r2';
  provider_metadata: AnyRecord;
  sha256: string;
  size_bytes: number;
};

export type PreparedImportMessage = {
  account: string;
  attachmentRows: AnyRecord[];
  customLabels: string[];
  date: string;
  direction: 'inbound' | 'outbound';
  email: Email;
  gmailLabels: string[];
  gmailThreadId: string | null;
  isArchived: boolean;
  isRead: boolean;
  isStarred: boolean;
  isTrashed: boolean;
  mailboxId: string;
  messageId: string;
  providerMessageId: string;
  raw: Uint8Array;
  rawMessageId: string;
  rawSha256: string;
  status: 'draft' | 'quarantined' | 'received' | 'sent';
  storedObjects: StoredObjectRow[];
  systemLabelSlugs: string[];
  threadId: string;
};

export type ThreadSummary = {
  firstMessageAt: string;
  id: string;
  lastMessageAt: string;
  messageCount: number;
  normalizedSubject: string;
  status: 'active' | 'archived' | 'spam' | 'trash';
  subject: string;
  unreadCount: number;
};

function table(admin: AnyRecord, name: string) {
  return admin.schema('private').from(name);
}

export function sanitizePostgrestPayload<T>(value: T): T {
  if (typeof value === 'string') {
    return value.replaceAll(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/gu,
      '\uFFFD'
    ) as T;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizePostgrestPayload) as T;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        sanitizePostgrestPayload(key),
        sanitizePostgrestPayload(entry),
      ])
    ) as T;
  }
  return value;
}

function importRows<T>(rows: T) {
  return sanitizePostgrestPayload(rows);
}

export function escapeLikePattern(value: string) {
  return value.replaceAll(/([\\%_])/gu, '\\$1');
}

export async function createImportAdmin() {
  return createAdminClient({ noCookie: true }) as AnyRecord;
}

export async function loadImportMailbox(admin: AnyRecord, address: string) {
  const { data, error } = await table(admin, 'mail_mailboxes')
    .select('id,address,status,type,created_by')
    .eq('address', address)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`No Tuturuuu mailbox exists for ${address}`);
  let stateUserId = data.created_by as string | null;
  if (!stateUserId) {
    const { data: user, error: userError } = await admin
      .from('user_private_details')
      .select('user_id')
      .ilike('email', escapeLikePattern(address))
      .maybeSingle();
    if (userError) throw userError;
    stateUserId = user?.user_id ?? null;
  }
  return {
    ...data,
    state_user_id: stateUserId,
  } as {
    address: string;
    created_by: string | null;
    id: string;
    state_user_id: string | null;
    status: string;
    type: string;
  };
}

async function loadPagedRows(
  build: (start: number, end: number) => PromiseLike<AnyRecord>,
  pageSize = 1000
) {
  const rows: AnyRecord[] = [];
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await build(start, start + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) return rows;
  }
}

export async function loadExistingMessageKeys(
  admin: AnyRecord,
  mailboxId: string
) {
  const rows = await loadPagedRows((start, end) =>
    table(admin, 'mail_messages')
      .select('provider_message_id,internet_message_id')
      .eq('mailbox_id', mailboxId)
      .order('id')
      .range(start, end)
  );
  return {
    internetMessageIds: new Set(
      rows.flatMap((row) =>
        row.internet_message_id ? [String(row.internet_message_id)] : []
      )
    ),
    providerMessageIds: new Set(
      rows.flatMap((row) =>
        row.provider_message_id ? [String(row.provider_message_id)] : []
      )
    ),
  };
}

export async function ensureImportLabels({
  admin,
  customLabels,
  mailboxId,
}: {
  admin: AnyRecord;
  customLabels: Map<string, string>;
  mailboxId: string;
}) {
  const safeCustomLabels = [...customLabels].map(([generatedSlug, name]) => ({
    generatedSlug,
    name: sanitizePostgrestPayload(name),
    slug: sanitizePostgrestPayload(generatedSlug),
  }));
  const system = [
    ['Inbox', 'inbox'],
    ['Sent', 'sent'],
    ['Drafts', 'drafts'],
    ['Archive', 'archive'],
    ['Trash', 'trash'],
    ['Starred', 'starred'],
    ['Spam', 'spam'],
  ].map(([name, slug]) => ({
    kind: 'system',
    mailbox_id: mailboxId,
    name,
    slug,
  }));
  const { data: existing, error: existingError } = await table(
    admin,
    'mail_labels'
  )
    .select('id,name,slug')
    .eq('mailbox_id', mailboxId);
  if (existingError) throw existingError;
  const existingByName = new Map(
    (existing ?? []).map((row: AnyRecord) => [String(row.name), row])
  );
  const custom = safeCustomLabels.flatMap(({ name, slug }) =>
    existingByName.has(name)
      ? []
      : [
          {
            kind: 'custom',
            mailbox_id: mailboxId,
            name,
            slug,
          },
        ]
  );
  const { error } = await table(admin, 'mail_labels').upsert(
    [...system, ...custom],
    { onConflict: 'mailbox_id,slug' }
  );
  if (error) throw error;
  const { data, error: loadError } = await table(admin, 'mail_labels')
    .select('id,name,slug')
    .eq('mailbox_id', mailboxId);
  if (loadError) throw loadError;
  const labelIds = new Map(
    (data ?? []).map((row: AnyRecord) => [String(row.slug), String(row.id)])
  );
  const importedByName = new Map(
    (data ?? []).map((row: AnyRecord) => [String(row.name), String(row.id)])
  );
  for (const { generatedSlug, name } of safeCustomLabels) {
    const id = importedByName.get(name);
    if (id) labelIds.set(generatedSlug, id);
  }
  return labelIds;
}

function validMailbox(address: { address?: string; name?: string }) {
  const value = address.address?.trim().toLowerCase();
  return value?.includes('@')
    ? { address: value, display_name: address.name?.trim() || null }
    : null;
}

function recipientRows(message: PreparedImportMessage) {
  const rows: AnyRecord[] = [];
  const add = (kind: string, addresses: Address[]) => {
    for (const [index, address] of flattenAddresses(addresses).entries()) {
      if (!address) continue;
      const normalized = validMailbox(address);
      if (!normalized) continue;
      rows.push({
        ...normalized,
        id: deterministicUuid(
          'google-takeout-recipient',
          `${message.messageId}:${kind}:${index}:${normalized.address}`
        ),
        kind,
        message_id: message.messageId,
      });
    }
  };
  const from = mailboxAddress(message.email.from);
  if (from) add('from', [from]);
  add('to', message.email.to ?? []);
  add('cc', message.email.cc ?? []);
  add('bcc', message.email.bcc ?? []);
  add('reply_to', message.email.replyTo ?? []);
  return rows;
}

function headerRecord(email: Email) {
  const headers: Record<string, string> = {};
  for (const header of email.headers) {
    headers[header.key] = headers[header.key]
      ? `${headers[header.key]}, ${header.value}`
      : header.value;
  }
  return headers;
}

export async function persistImportBatch({
  admin,
  labelIds,
  mailboxOwnerId,
  messages,
  threadRows,
}: {
  admin: AnyRecord;
  labelIds: Map<string, string>;
  mailboxOwnerId: string | null;
  messages: PreparedImportMessage[];
  threadRows: AnyRecord[];
}) {
  if (messages.length === 0) return;
  const initialObjects = messages.flatMap((message) =>
    message.storedObjects.map((object) => ({ ...object, message_id: null }))
  );
  let result = await table(admin, 'mail_stored_objects').upsert(
    importRows(initialObjects),
    {
      onConflict: 'id',
    }
  );
  if (result.error) throw result.error;

  result = await table(admin, 'mail_raw_messages').upsert(
    importRows(
      messages.map((message) => ({
        id: message.rawMessageId,
        provider: 'google_takeout',
        provider_message_id: message.providerMessageId,
        provider_payload: {
          account: message.account,
          gmailLabels: message.gmailLabels,
          gmailThreadId: message.gmailThreadId,
          source: 'google_workspace_export',
        },
        raw_headers: headerRecord(message.email),
        sha256: message.rawSha256,
        size_bytes: message.raw.byteLength,
        status: 'imported',
        stored_object_id: message.storedObjects[0]?.id ?? null,
        created_at: message.date,
      }))
    ),
    { onConflict: 'id' }
  );
  if (result.error) throw result.error;

  result = await table(admin, 'mail_threads').upsert(importRows(threadRows), {
    ignoreDuplicates: true,
    onConflict: 'id',
  });
  if (result.error) throw result.error;

  result = await table(admin, 'mail_messages').upsert(
    importRows(
      messages.map((message) => {
        const from = mailboxAddress(message.email.from);
        const sanitizedHtml = message.email.html
          ? sanitizeMailHtml(message.email.html)
          : null;
        const bodyText =
          message.email.text ??
          (sanitizedHtml ? stripHtml(sanitizedHtml) : null);
        return {
          body_html: message.email.html ?? null,
          body_text: bodyText,
          created_at: message.date,
          direction: message.direction,
          from_address:
            from?.address?.trim().toLowerCase() ?? 'unknown@example.invalid',
          from_name: from?.name?.trim() || null,
          has_attachments: message.attachmentRows.length > 0,
          id: message.messageId,
          in_reply_to: message.email.inReplyTo ?? null,
          internet_message_id: message.email.messageId ?? null,
          mailbox_id: message.mailboxId,
          metadata: {
            googleTakeout: {
              gmailLabels: message.gmailLabels,
              gmailThreadId: message.gmailThreadId,
              rawSha256: message.rawSha256,
            },
          },
          provider: 'google_takeout',
          provider_message_id: message.providerMessageId,
          raw_message_id: message.rawMessageId,
          received_at: message.direction === 'inbound' ? message.date : null,
          references_headers:
            message.email.references?.split(/\s+/u).filter(Boolean) ?? [],
          sanitized_html: sanitizedHtml,
          sent_at: message.direction === 'outbound' ? message.date : null,
          size_bytes: message.raw.byteLength,
          snippet: createSnippet({ html: sanitizedHtml, text: bodyText }),
          status: message.status,
          subject: message.email.subject?.trim() || '(no subject)',
          thread_id: message.threadId,
          updated_at: message.date,
        };
      })
    ),
    { onConflict: 'id' }
  );
  if (result.error) throw result.error;

  const recipients = messages.flatMap(recipientRows);
  if (recipients.length) {
    result = await table(admin, 'mail_recipients').upsert(
      importRows(recipients),
      {
        onConflict: 'id',
      }
    );
    if (result.error) throw result.error;
  }
  const attachments = messages.flatMap((message) => message.attachmentRows);
  if (attachments.length) {
    result = await table(admin, 'mail_attachments').upsert(
      importRows(attachments),
      {
        onConflict: 'id',
      }
    );
    if (result.error) throw result.error;
  }
  const messageLabels = messages.flatMap((message) =>
    [...message.systemLabelSlugs, ...message.customLabels].flatMap((slug) => {
      const labelId = labelIds.get(slug);
      return labelId
        ? [{ label_id: labelId, message_id: message.messageId }]
        : [];
    })
  );
  if (messageLabels.length) {
    result = await table(admin, 'mail_message_labels').upsert(
      importRows(messageLabels),
      { onConflict: 'message_id,label_id' }
    );
    if (result.error) throw result.error;
  }
  if (mailboxOwnerId) {
    result = await table(admin, 'mail_message_user_state').upsert(
      importRows(
        messages.map((message) => ({
          archived_at: message.isArchived ? message.date : null,
          mailbox_id: message.mailboxId,
          message_id: message.messageId,
          read_at: message.isRead ? message.date : null,
          starred_at: message.isStarred ? message.date : null,
          trashed_at: message.isTrashed ? message.date : null,
          user_id: mailboxOwnerId,
        }))
      ),
      { onConflict: 'message_id,user_id' }
    );
    if (result.error) throw result.error;
  }
  result = await table(admin, 'mail_stored_objects').upsert(
    importRows(messages.flatMap((message) => message.storedObjects)),
    { onConflict: 'id' }
  );
  if (result.error) throw result.error;
}

export async function finalizeThreads({
  admin,
  mailboxId,
  threads,
}: {
  admin: AnyRecord;
  mailboxId: string;
  threads: ThreadSummary[];
}) {
  const { error } = await table(admin, 'mail_threads').upsert(
    importRows(
      threads.map((thread) => ({
        created_at: thread.firstMessageAt,
        id: thread.id,
        last_message_at: thread.lastMessageAt,
        mailbox_id: mailboxId,
        message_count: thread.messageCount,
        normalized_subject: thread.normalizedSubject,
        status: thread.status,
        subject: thread.subject,
        unread_count: thread.unreadCount,
        updated_at: thread.lastMessageAt,
      }))
    ),
    { onConflict: 'id' }
  );
  if (error) throw error;
}
