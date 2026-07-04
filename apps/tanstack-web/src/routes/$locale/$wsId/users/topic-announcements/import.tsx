import { createFileRoute, notFound } from '@tanstack/react-router';
import { TopicAnnouncementsImportPageClient } from '../../../../../components/users/topic-announcements/import/import-page-client';
import {
  getWorkspaceNextPath,
  requireCurrentUser,
} from '../../../../../lib/platform/auth-gate';
import { createPageHead } from '../../../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../../../lib/platform/messages';
import { isTopicAnnouncementsEnabled } from '../../../../../lib/platform/topic-announcements';
import { resolveFullWorkspace } from '../../../../../lib/platform/workspace';
import { hasWorkspacePermission } from '../../../../../lib/platform/workspace-permission';

interface TopicAnnouncementsImportData {
  canSend: boolean;
  workspaceId: string;
}

export const Route = createFileRoute(
  '/$locale/$wsId/users/topic-announcements/import'
)({
  component: TopicAnnouncementsImportRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Bulk import topic announcements from spreadsheets or editable rows.',
      locale,
      title: 'Import Topic Announcements',
    });
  },
  loader: async ({
    location,
    params,
  }): Promise<TopicAnnouncementsImportData> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: getWorkspaceNextPath(
        params,
        location.pathname,
        'users/topic-announcements/import'
      ),
    });

    const workspace = await resolveFullWorkspace({
      data: { wsId: params.wsId },
    });
    if (!workspace.exists || workspace.workspace.personal) {
      throw notFound();
    }

    const [enabled, canManageUsers, canSend] = await Promise.all([
      isTopicAnnouncementsEnabled({
        data: { workspaceId: workspace.workspace.id },
      }),
      hasWorkspacePermission({
        data: {
          permission: 'manage_users',
          wsId: workspace.workspace.id,
        },
      }),
      hasWorkspacePermission({
        data: {
          permission: 'send_user_group_post_emails',
          wsId: workspace.workspace.id,
        },
      }),
    ]);
    if (!(enabled && canManageUsers)) {
      throw notFound();
    }

    return {
      canSend,
      workspaceId: workspace.workspace.id,
    };
  },
});

function TopicAnnouncementsImportRoutePage() {
  const data = Route.useLoaderData() as
    | TopicAnnouncementsImportData
    | undefined;
  const params = Route.useParams();

  if (!data) {
    throw notFound();
  }

  return (
    <TopicAnnouncementsImportPageClient
      canSend={data.canSend}
      locale={params.locale}
      wsId={data.workspaceId}
    />
  );
}
