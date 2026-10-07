import { NextResponse } from 'next/server';
import { normalizeTopicAnnouncementAttachmentFileName } from './attachments';

export type TopicAnnouncementsSupabaseClient = any;

export interface TopicAnnouncementsAccessContext {
  actorUserId: string;
  normalizedWsId: string;
  sbAdmin: TopicAnnouncementsSupabaseClient;
  supabase: TopicAnnouncementsSupabaseClient;
}

export type TopicAnnouncementContactRow = {
  archived: boolean;
  created_at: string;
  email: string;
  id: string;
  metadata: unknown;
  name: string;
  tags: string[];
  workspace_user_id: string | null;
};

export type SerializedTopicAnnouncementContact = {
  archived: boolean;
  createdAt: string;
  email: string;
  id: string;
  metadata: unknown;
  name: string;
  tags: string[];
  verificationStatus:
    | 'linked_confirmed_account'
    | 'needs_verification'
    | 'pending'
    | 'verified';
  workspaceUserId: string | null;
};

export type TopicAnnouncementAttachmentRow = {
  content_type: string;
  created_at: string;
  file_name: string;
  id: string;
  size_bytes: number;
  storage_path: string;
  storage_provider: 'r2' | 'supabase';
};

export type SerializedTopicAnnouncementAttachment = {
  contentType: string;
  createdAt: string;
  fileName: string;
  id: string;
  sizeBytes: number;
  storagePath: string;
  storageProvider: 'r2' | 'supabase';
};

export function getPrivateSchemaClient(
  client: TopicAnnouncementsSupabaseClient
): TopicAnnouncementsSupabaseClient {
  return typeof client?.schema === 'function'
    ? client.schema('private')
    : client;
}

export function getPublicSchemaClient(
  client: TopicAnnouncementsSupabaseClient
): TopicAnnouncementsSupabaseClient {
  return typeof client?.schema === 'function'
    ? client.schema('public')
    : client;
}

export async function attachTopicAnnouncementGroups<
  T extends { group_id?: string | null },
>(sbAdmin: TopicAnnouncementsSupabaseClient, rows: T[]): Promise<T[]> {
  const groupIds = [
    ...new Set(
      rows
        .map((row) => row.group_id)
        .filter((groupId): groupId is string => Boolean(groupId))
    ),
  ];

  if (groupIds.length === 0) return rows;

  const publicAdmin = getPublicSchemaClient(sbAdmin);
  const { data, error } = await publicAdmin
    .from('workspace_user_groups')
    .select('id,name')
    .in('id', groupIds);
  if (error) throw error;

  const groupsById = new Map(
    (data ?? []).map((group: { id: string; name: string }) => [group.id, group])
  );

  return rows.map((row) => ({
    ...row,
    group: row.group_id ? (groupsById.get(row.group_id) ?? null) : null,
  }));
}

export function serializeTopicAnnouncementContact(
  contact: TopicAnnouncementContactRow,
  verificationStatus: SerializedTopicAnnouncementContact['verificationStatus']
): SerializedTopicAnnouncementContact {
  return {
    archived: contact.archived,
    createdAt: contact.created_at,
    email: contact.email,
    id: contact.id,
    metadata: contact.metadata,
    name: contact.name,
    tags: contact.tags,
    verificationStatus,
    workspaceUserId: contact.workspace_user_id,
  };
}

export function serializeTopicAnnouncementAttachment(
  attachment: TopicAnnouncementAttachmentRow
): SerializedTopicAnnouncementAttachment {
  return {
    contentType: attachment.content_type,
    createdAt: attachment.created_at,
    fileName: normalizeTopicAnnouncementAttachmentFileName(
      attachment.file_name
    ),
    id: attachment.id,
    sizeBytes: Number(attachment.size_bytes),
    storagePath: attachment.storage_path,
    storageProvider: attachment.storage_provider,
  };
}

export async function getContactVerificationStatuses(
  sbAdmin: TopicAnnouncementsSupabaseClient,
  contactIds: string[]
) {
  const uniqueIds = [...new Set(contactIds)];
  const statuses = new Map<
    string,
    'linked_confirmed_account' | 'verified' | 'pending' | 'needs_verification'
  >();

  for (const contactId of uniqueIds) {
    statuses.set(contactId, 'needs_verification');
  }
  if (uniqueIds.length === 0) return statuses;

  const now = new Date().toISOString();
  const { data: verifications, error } = await sbAdmin
    .from('topic_announcement_contact_verifications')
    .select('contact_id,status,expires_at')
    .in('contact_id', uniqueIds)
    .in('status', ['pending', 'verified'])
    .order('created_at', { ascending: false });

  if (error) throw error;

  for (const row of verifications ?? []) {
    if (row.status === 'verified') {
      statuses.set(row.contact_id, 'verified');
    } else if (
      statuses.get(row.contact_id) === 'needs_verification' &&
      row.expires_at > now
    ) {
      statuses.set(row.contact_id, 'pending');
    }
  }

  for (const contactId of uniqueIds) {
    const { data, error: rpcError } = await sbAdmin.rpc(
      'topic_announcement_contact_has_linked_verified_email',
      { p_contact_id: contactId }
    );
    if (rpcError) throw rpcError;
    if (data) statuses.set(contactId, 'linked_confirmed_account');
  }

  return statuses;
}

export async function serializeTopicAnnouncementContacts(
  sbAdmin: TopicAnnouncementsSupabaseClient,
  contacts: TopicAnnouncementContactRow[]
): Promise<SerializedTopicAnnouncementContact[]> {
  if (contacts.length === 0) return [];

  const statuses = await getContactVerificationStatuses(
    sbAdmin,
    contacts.map((contact) => contact.id)
  );

  return contacts.map((contact) =>
    serializeTopicAnnouncementContact(
      contact,
      statuses.get(contact.id) ?? 'needs_verification'
    )
  );
}

export function mapTopicAnnouncementRow(announcement: {
  attachments?: TopicAnnouncementAttachmentRow[];
  contacts?: SerializedTopicAnnouncementContact[];
  group?: { id: string; name: string } | { id: string; name: string }[] | null;
  [key: string]: unknown;
}) {
  const { attachments, contacts, group: rawGroup, ...rest } = announcement;
  const group = Array.isArray(rawGroup) ? (rawGroup[0] ?? null) : rawGroup;

  return {
    ...rest,
    attachments: (attachments ?? []).map(serializeTopicAnnouncementAttachment),
    ...(contacts ? { contacts } : {}),
    group:
      group && typeof group === 'object' && 'id' in group
        ? { id: group.id, name: group.name }
        : null,
  };
}

export async function validateTopicAnnouncementGroupId({
  groupId,
  normalizedWsId,
  sbAdmin,
}: {
  groupId: string | null | undefined;
  normalizedWsId: string;
  sbAdmin: TopicAnnouncementsSupabaseClient;
}) {
  if (!groupId) return null;

  const publicAdmin = getPublicSchemaClient(sbAdmin);
  const { data, error } = await publicAdmin
    .from('workspace_user_groups')
    .select('id')
    .eq('ws_id', normalizedWsId)
    .eq('id', groupId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return NextResponse.json(
      { message: 'Invalid user group' },
      { status: 400 }
    );
  }

  return null;
}
