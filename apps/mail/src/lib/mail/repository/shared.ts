import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { resolveInternalMailboxName } from '../identity';
import type {
  MailLabel,
  MailMailbox,
  MailMailboxRole,
  MailRecipient,
} from '../types';

export type AnyRecord = Record<string, any>;
export type MailTableName =
  | 'mail_attachments'
  | 'mail_domains'
  | 'mail_events'
  | 'mail_folders'
  | 'mail_inbound_jobs'
  | 'mail_labels'
  | 'mail_mailbox_members'
  | 'mail_mailboxes'
  | 'mail_message_labels'
  | 'mail_message_folders'
  | 'mail_message_user_state'
  | 'mail_messages'
  | 'mail_outbound_jobs'
  | 'mail_raw_messages'
  | 'mail_recipients'
  | 'mail_stored_objects'
  | 'mail_threads';

export const SYSTEM_LABELS = [
  { kind: 'system', name: 'Inbox', slug: 'inbox' },
  { kind: 'system', name: 'Sent', slug: 'sent' },
  { kind: 'system', name: 'Drafts', slug: 'drafts' },
  { kind: 'system', name: 'Archive', slug: 'archive' },
  { kind: 'system', name: 'Trash', slug: 'trash' },
  { kind: 'system', name: 'Starred', slug: 'starred' },
  { kind: 'system', name: 'Spam', slug: 'spam' },
] as const;

export function privateTable(client: AnyRecord, table: MailTableName) {
  return client.schema('private').from(table);
}

export async function getAdminClient() {
  return createAdminClient({ noCookie: true });
}

export function normalizeAddress(value: string) {
  return value.trim().toLowerCase();
}

export function toMailbox(
  row: AnyRecord,
  role: MailMailboxRole,
  personalUserDisplayName?: string | null
): MailMailbox {
  const domain = row.mail_domain as AnyRecord | undefined;
  const effectiveOutboundProvider =
    row.outbound_provider_override ?? domain?.outbound_provider ?? 'ses';
  const canonicalPersonalName =
    row.type === 'personal'
      ? resolveInternalMailboxName(personalUserDisplayName, row.address)
      : null;

  return {
    address: row.address,
    aiInstructions: row.ai_instructions ?? '',
    autoDraftEnabled: Boolean(row.auto_draft_enabled),
    displayName: canonicalPersonalName || row.display_name || row.address,
    domainId: row.domain_id,
    effectiveOutboundProvider,
    id: row.id,
    outboundProviderOverride: row.outbound_provider_override ?? null,
    providerLimits: {
      maxMessageBytes:
        effectiveOutboundProvider === 'cloudflare'
          ? 5 * 1024 * 1024
          : 10 * 1024 * 1024,
      maxRecipients: 50,
    },
    role,
    senderName:
      canonicalPersonalName ||
      row.sender_name ||
      row.display_name ||
      row.address,
    signatureHtml: row.signature_html ?? null,
    signatureText: row.signature_text ?? null,
    status: row.status,
    type: row.type,
    unreadCount: Number(row.unread_count ?? 0),
  };
}

export function toLabel(row: AnyRecord): MailLabel {
  return {
    color: row.color ?? null,
    id: row.id,
    kind: row.kind,
    mailboxId: row.mailbox_id,
    name: row.name,
    slug: row.slug,
  };
}

export function toRecipient(row: AnyRecord): MailRecipient {
  return {
    address: row.address,
    displayName: row.display_name ?? null,
    kind: row.kind,
  };
}

export async function getCanonicalUserDisplayNames(
  admin: AnyRecord,
  userIds: string[]
) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueUserIds.length === 0) return new Map<string, string>();

  const { data, error } = await admin
    .from('users')
    .select('id, display_name')
    .in('id', uniqueUserIds);

  if (error) {
    throw new Error(`Failed to load user display names: ${error.message}`);
  }

  return new Map<string, string>(
    (data ?? []).flatMap((user: AnyRecord) => {
      const displayName = user.display_name?.trim();
      return displayName ? [[user.id, displayName]] : [];
    })
  );
}

export async function getCanonicalUserDisplayName(
  admin: AnyRecord,
  userId: string | null | undefined
) {
  if (!userId) return null;
  const names = await getCanonicalUserDisplayNames(admin, [userId]);
  return names.get(userId) ?? null;
}

export async function ensureSystemLabels(admin: AnyRecord, mailboxId: string) {
  const rows = SYSTEM_LABELS.map((label) => ({
    ...label,
    mailbox_id: mailboxId,
  }));

  const { error } = await privateTable(admin, 'mail_labels').upsert(rows, {
    onConflict: 'mailbox_id,slug',
  });

  if (error) {
    throw new Error(`Failed to ensure mail labels: ${error.message}`);
  }
}
