import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  getSecret,
  getSecrets,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { normalizeTopicAnnouncementAttachmentFileName } from '@/lib/topic-announcement-attachments';
import { TOPIC_ANNOUNCEMENTS_SECRET } from '@/lib/topic-announcements';
import { getContactVerificationStatuses } from './email';

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

type TopicAnnouncementAttachmentDraftInput = {
  contentType: string;
  fileName: string;
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

export async function insertTopicAnnouncementAttachmentDrafts({
  actorUserId,
  announcementId,
  attachmentDrafts,
  normalizedWsId,
  sbAdmin,
}: {
  actorUserId: string;
  announcementId: string;
  attachmentDrafts: TopicAnnouncementAttachmentDraftInput[];
  normalizedWsId: string;
  sbAdmin: TopicAnnouncementsSupabaseClient;
}) {
  if (attachmentDrafts.length === 0) return;

  const { error } = await sbAdmin.from('topic_announcement_attachments').insert(
    attachmentDrafts.map((attachment) => ({
      announcement_id: announcementId,
      content_type: attachment.contentType,
      created_by: actorUserId,
      file_name: normalizeTopicAnnouncementAttachmentFileName(
        attachment.fileName
      ),
      size_bytes: attachment.sizeBytes,
      storage_path: attachment.storagePath,
      storage_provider: attachment.storageProvider,
      ws_id: normalizedWsId,
    }))
  );
  if (error) throw error;
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

export async function resolveTopicAnnouncementsAccess(
  request: Request,
  wsId: string,
  {
    requireManage = false,
    requireSend = false,
  }: {
    requireManage?: boolean;
    requireSend?: boolean;
  } = {}
): Promise<
  | { context: TopicAnnouncementsAccessContext; response?: never }
  | { context?: never; response: NextResponse }
> {
  const supabase = (await createClient(
    request
  )) as TopicAnnouncementsSupabaseClient;
  const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
  const permissions = await getPermissions({ request, wsId: normalizedWsId });

  if (!permissions) {
    return {
      response: NextResponse.json({ message: 'Not found' }, { status: 404 }),
    };
  }

  const secrets = await getSecrets({ forceAdmin: true, wsId: normalizedWsId });
  const enabled =
    getSecret(TOPIC_ANNOUNCEMENTS_SECRET, secrets ?? [])?.value === 'true';
  if (!enabled) {
    return {
      response: NextResponse.json({ message: 'Not found' }, { status: 404 }),
    };
  }

  const adminClient =
    (await createAdminClient()) as TopicAnnouncementsSupabaseClient;
  const publicAdmin = getPublicSchemaClient(adminClient);
  const sbAdmin = getPrivateSchemaClient(adminClient);
  const { data: workspace, error: workspaceError } = await publicAdmin
    .from('workspaces')
    .select('personal')
    .eq('id', normalizedWsId)
    .maybeSingle();
  if (workspaceError || !workspace || workspace.personal) {
    return {
      response: NextResponse.json({ message: 'Not found' }, { status: 404 }),
    };
  }

  if (requireManage && permissions.withoutPermission('manage_users')) {
    return {
      response: NextResponse.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      ),
    };
  }

  if (
    requireSend &&
    (permissions.withoutPermission('manage_users') ||
      permissions.withoutPermission('send_user_group_post_emails'))
  ) {
    return {
      response: NextResponse.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      ),
    };
  }

  const { user } = await resolveAuthenticatedSessionUser(supabase);
  if (!user) {
    return {
      response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  }

  return {
    context: {
      actorUserId: user.id,
      normalizedWsId,
      sbAdmin,
      supabase,
    },
  };
}
