import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  InternalApiError,
  listTopicAnnouncementTemplates,
  listWorkspaceUserGroups,
  type TopicAnnouncementTemplateRecord,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { TopicAnnouncementsTemplatesPageClient } from '../../../../../components/users/topic-announcements/templates-page-client';
import {
  getWorkspaceNextPath,
  requireCurrentUser,
} from '../../../../../lib/platform/auth-gate';
import { createPageHead } from '../../../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../../../lib/platform/messages';
import { isTopicAnnouncementsEnabled } from '../../../../../lib/platform/topic-announcements';
import { resolveFullWorkspace } from '../../../../../lib/platform/workspace';
import { hasWorkspacePermission } from '../../../../../lib/platform/workspace-permission';

interface TopicAnnouncementsTemplatesData {
  groups: UserGroup[];
  templates: TopicAnnouncementTemplateRecord[];
  workspaceId: string;
}

const loadTopicAnnouncementsTemplatesData = createServerFn({ method: 'GET' })
  .validator((data: { wsId: string }) => data)
  .handler(async ({ data }) => {
    const authOptions = withForwardedInternalApiAuth(getRequestHeaders());
    const [templatesResponse, groupsResponse] = await Promise.all([
      listTopicAnnouncementTemplates(data.wsId, authOptions),
      listWorkspaceUserGroups(
        data.wsId,
        {
          page: 1,
          pageSize: 200,
          status: 'active',
        },
        authOptions
      ),
    ]);

    return {
      groups: groupsResponse.data ?? [],
      templates: templatesResponse.data ?? [],
    };
  });

function isTopicAnnouncementsUnavailable(error: unknown) {
  return (
    error instanceof InternalApiError &&
    (error.status === 401 || error.status === 403 || error.status === 404)
  );
}

export const Route = createFileRoute(
  '/$locale/$wsId/users/topic-announcements/templates'
)({
  component: TopicAnnouncementsTemplatesRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Create and maintain reusable presets for repeated class schedules and topic messages.',
      locale,
      title: 'Topic Announcement Templates',
    });
  },
  loader: async ({
    location,
    params,
  }): Promise<TopicAnnouncementsTemplatesData> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: getWorkspaceNextPath(
        params,
        location.pathname,
        'users/topic-announcements/templates'
      ),
    });

    const workspace = await resolveFullWorkspace({
      data: { wsId: params.wsId },
    });
    if (!workspace.exists || workspace.workspace.personal) {
      throw notFound();
    }

    const [enabled, canManageUsers] = await Promise.all([
      isTopicAnnouncementsEnabled({
        data: { workspaceId: workspace.workspace.id },
      }),
      hasWorkspacePermission({
        data: {
          permission: 'manage_users',
          wsId: workspace.workspace.id,
        },
      }),
    ]);
    if (!(enabled && canManageUsers)) {
      throw notFound();
    }

    try {
      const data = await loadTopicAnnouncementsTemplatesData({
        data: { wsId: workspace.workspace.id },
      });

      return {
        groups: data.groups,
        templates: data.templates,
        workspaceId: workspace.workspace.id,
      };
    } catch (error) {
      if (isTopicAnnouncementsUnavailable(error)) {
        throw notFound();
      }

      throw error;
    }
  },
});

function TopicAnnouncementsTemplatesRoutePage() {
  const data = Route.useLoaderData() as
    | TopicAnnouncementsTemplatesData
    | undefined;

  if (!data) {
    throw notFound();
  }

  return (
    <TopicAnnouncementsTemplatesPageClient
      initialGroups={data.groups}
      initialTemplates={data.templates}
      wsId={data.workspaceId}
    />
  );
}
