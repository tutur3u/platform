import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  decideTopicAnnouncementAccessMode,
  getPrivateSchemaClient,
  getPublicSchemaClient,
  resolveTopicAnnouncementTeacherScope,
  type TopicAnnouncementAccessResolver,
  type TopicAnnouncementAccessScope,
} from '@tuturuuu/users-core/routes/topic-announcements';
import { TOPIC_ANNOUNCEMENTS_SECRET } from '@tuturuuu/utils/topic-announcements';
import { getSecret, getSecrets } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { getContactsWorkspaceAccess } from './workspace';

/** Authorize the satellite actor before any topic content or feature reads. */
export const resolveContactsTopicAnnouncementsAccess: TopicAnnouncementAccessResolver =
  async (_request, wsId, options = {}) => {
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
    const publicAdmin = getPublicSchemaClient(admin);
    const { data: workspace, error } = await publicAdmin
      .from('workspaces')
      .select('personal')
      .eq('id', normalizedWsId)
      .maybeSingle();
    if (error || !workspace || workspace.personal) {
      return {
        response: NextResponse.json({ message: 'Not found' }, { status: 404 }),
      };
    }

    const mode = decideTopicAnnouncementAccessMode({
      ...options,
      hasPermission: (permission) =>
        !access.permissions.withoutPermission(
          permission as Parameters<
            typeof access.permissions.withoutPermission
          >[0]
        ),
    });
    if (mode === 'denied') {
      return {
        response: NextResponse.json(
          { message: 'Insufficient permissions' },
          { status: 403 }
        ),
      };
    }

    // The satellite actor's linked workspace user comes from the Contacts
    // app session (getContactsWorkspaceAccess), never from Supabase auth.
    const scope: TopicAnnouncementAccessScope =
      mode === 'teacher'
        ? await resolveTopicAnnouncementTeacherScope({
            publicAdmin,
            workspaceUserId: access.user.virtual_user_id,
            wsId: normalizedWsId,
          })
        : { kind: 'manager' };

    return {
      context: {
        actorUserId: access.actor.id,
        normalizedWsId,
        sbAdmin: getPrivateSchemaClient(admin),
        scope,
        supabase: admin,
      },
    };
  };
