import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type {
  MailLabel,
  MailMailbox,
  MailMailboxRole,
  MailRecipient,
  MailRouteContext,
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

export function toMailbox(row: AnyRecord, role: MailMailboxRole): MailMailbox {
  return {
    address: row.address,
    displayName: row.display_name || row.address,
    id: row.id,
    role,
    status: row.status,
    type: row.type,
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

export function getUserDisplayName(user: MailRouteContext['user']) {
  return user.email?.split('@')[0] ?? 'Tuturuuu Mail';
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
