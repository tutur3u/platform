import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  getPrivateSchemaClient,
  getPublicSchemaClient,
  type TopicAnnouncementsAccessContext,
  type TopicAnnouncementsSupabaseClient,
} from '@tuturuuu/users-core/routes/topic-announcements';
import { TOPIC_ANNOUNCEMENTS_SECRET } from '@tuturuuu/utils/topic-announcements';
import {
  getPermissions,
  getSecret,
  getSecrets,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { normalizeTopicAnnouncementAttachmentFileName } from '@/lib/topic-announcement-attachments';

export {
  attachTopicAnnouncementGroups,
  getPrivateSchemaClient,
  getPublicSchemaClient,
  mapTopicAnnouncementRow,
  type SerializedTopicAnnouncementAttachment,
  type SerializedTopicAnnouncementContact,
  serializeTopicAnnouncementAttachment,
  serializeTopicAnnouncementContact,
  serializeTopicAnnouncementContacts,
  type TopicAnnouncementAttachmentRow,
  type TopicAnnouncementContactRow,
  type TopicAnnouncementsAccessContext,
  type TopicAnnouncementsSupabaseClient,
} from '@tuturuuu/users-core/routes/topic-announcements';

type TopicAnnouncementAttachmentDraftInput = {
  contentType: string;
  fileName: string;
  sizeBytes: number;
  storagePath: string;
  storageProvider: 'r2' | 'supabase';
};

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
