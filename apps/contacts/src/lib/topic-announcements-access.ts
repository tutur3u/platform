import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  getPrivateSchemaClient,
  getPublicSchemaClient,
  type TopicAnnouncementAccessResolver,
} from '@tuturuuu/users-core/routes/topic-announcements';
import { TOPIC_ANNOUNCEMENTS_SECRET } from '@tuturuuu/utils/topic-announcements';
import { getSecret, getSecrets } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { getContactsWorkspaceAccess } from './workspace';

/** Authorize the satellite actor before any topic content or feature reads. */
export const resolveContactsTopicAnnouncementsAccess: TopicAnnouncementAccessResolver =
  async (
    _request,
    wsId,
    { requireManage = false, requireSend = false } = {}
  ) => {
    const access = await getContactsWorkspaceAccess(wsId);
    if (!access) {
      return {
        response: NextResponse.json({ message: 'Not found' }, { status: 404 }),
      };
    }
    const normalizedWsId = access.user.ws_id;
    if (!normalizedWsId) {
      return {
        response: NextResponse.json({ message: 'Not found' }, { status: 404 }),
      };
    }
    const secrets = await getSecrets({
      forceAdmin: true,
      wsId: normalizedWsId,
    });
    if (
      getSecret(TOPIC_ANNOUNCEMENTS_SECRET, secrets ?? [])?.value !== 'true'
    ) {
      return {
        response: NextResponse.json({ message: 'Not found' }, { status: 404 }),
      };
    }
    const admin = await createAdminClient({ noCookie: true });
    const { data: workspace, error } = await getPublicSchemaClient(admin)
      .from('workspaces')
      .select('personal')
      .eq('id', normalizedWsId)
      .maybeSingle();
    if (error || !workspace || workspace.personal) {
      return {
        response: NextResponse.json({ message: 'Not found' }, { status: 404 }),
      };
    }
    if (
      (requireManage && access.permissions.withoutPermission('manage_users')) ||
      (requireSend &&
        (access.permissions.withoutPermission('manage_users') ||
          access.permissions.withoutPermission('send_user_group_post_emails')))
    ) {
      return {
        response: NextResponse.json(
          { message: 'Insufficient permissions' },
          { status: 403 }
        ),
      };
    }
    return {
      context: {
        actorUserId: access.actor.id,
        normalizedWsId,
        sbAdmin: getPrivateSchemaClient(admin),
        supabase: admin,
      },
    };
  };
