import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  decideTopicAnnouncementAccessMode,
  getPrivateSchemaClient,
  getPublicSchemaClient,
  resolveTopicAnnouncementTeacherScope,
  type TopicAnnouncementAccessOptions,
  type TopicAnnouncementAccessScope,
  type TopicAnnouncementsAccessContext,
  type TopicAnnouncementsSupabaseClient,
} from '@tuturuuu/users-core/routes/topic-announcements';
import {
  isTopicTeacherAssignmentsEnabled,
  TOPIC_ANNOUNCEMENTS_SECRET,
} from '@tuturuuu/utils/topic-announcements';
import {
  getPermissions,
  getSecret,
  getSecrets,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { resolveSessionAuthContext } from '@/lib/api-auth';
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

const insufficientPermissions = () =>
  NextResponse.json({ message: 'Insufficient permissions' }, { status: 403 });

export async function resolveTopicAnnouncementsAccess(
  request: Request,
  wsId: string,
  options: TopicAnnouncementAccessOptions = {}
): Promise<
  | { context: TopicAnnouncementsAccessContext; response?: never }
  | { context?: never; response: NextResponse }
> {
  const session = await resolveSessionAuthContext(request, {
    allowAppSessionAuth: { targetApp: ['contacts'] },
  });
  if (!session.ok) return { response: session.response };
  const { supabase, user } = session;
  const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
  const permissions = await getPermissions({ user, wsId: normalizedWsId });

  if (!permissions) {
    return {
      response: NextResponse.json({ message: 'Not found' }, { status: 404 }),
    };
  }

  const secrets = await getSecrets({ forceAdmin: true, wsId: normalizedWsId });
  const enabled =
    getSecret(TOPIC_ANNOUNCEMENTS_SECRET, secrets ?? [])?.value === 'true';
  const teacherAssignmentsEnabled = isTopicTeacherAssignmentsEnabled(
    secrets ?? []
  );
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

  const mode = decideTopicAnnouncementAccessMode({
    ...options,
    hasPermission: (permission) =>
      !permissions.withoutPermission(
        permission as Parameters<typeof permissions.withoutPermission>[0]
      ),
    teacherAssignmentsEnabled,
  });
  if (mode === 'denied') return { response: insufficientPermissions() };

  let scope: TopicAnnouncementAccessScope = { kind: 'manager' };
  if (mode === 'teacher') {
    const { data: link, error: linkError } = await publicAdmin
      .from('workspace_user_linked_users')
      .select('virtual_user_id')
      .eq('platform_user_id', user.id)
      .eq('ws_id', normalizedWsId)
      .maybeSingle();
    if (linkError) throw linkError;
    if (!link?.virtual_user_id) return { response: insufficientPermissions() };

    scope = await resolveTopicAnnouncementTeacherScope({
      publicAdmin,
      workspaceUserId: link.virtual_user_id,
      wsId: normalizedWsId,
    });
  }

  return {
    context: {
      actorUserId: user.id,
      normalizedWsId,
      sbAdmin,
      scope,
      supabase,
      teacherAssignmentsEnabled,
    },
  };
}
