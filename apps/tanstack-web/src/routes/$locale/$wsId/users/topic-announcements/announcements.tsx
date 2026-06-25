import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  getWorkspaceCalendarSettings,
  InternalApiError,
  listTopicAnnouncementContacts,
  listTopicAnnouncements,
  listTopicAnnouncementTemplates,
  listWorkspaceBasicUsers,
  listWorkspaceUserGroups,
  type TopicAnnouncementContact,
  type TopicAnnouncementRecord,
  type TopicAnnouncementTemplateRecord,
  type WorkspaceBasicUserRecord,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { TopicAnnouncementsAnnouncementsPageClient } from '../../../../../components/users/topic-announcements/announcements/announcements-page-client';
import {
  getWorkspaceNextPath,
  requireCurrentUser,
} from '../../../../../lib/platform/auth-gate';
import { createPageHead } from '../../../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../../../lib/platform/messages';
import { isTopicAnnouncementsEnabled } from '../../../../../lib/platform/topic-announcements';
import { resolveFullWorkspace } from '../../../../../lib/platform/workspace';
import { hasWorkspacePermission } from '../../../../../lib/platform/workspace-permission';

type JsonValue =
  | JsonValue[]
  | boolean
  | null
  | number
  | string
  | { [key: string]: JsonValue };

type SerializableTopicAnnouncementContact = Omit<
  TopicAnnouncementContact,
  'metadata'
> & {
  metadata: JsonValue | null;
};

type SerializableTopicAnnouncementRecord = Omit<
  TopicAnnouncementRecord,
  'contacts'
> & {
  contacts: SerializableTopicAnnouncementContact[];
};

interface TopicAnnouncementsListData {
  count: number;
  data: SerializableTopicAnnouncementRecord[];
  page: number;
  pageSize: number;
  totalPages: number;
}

interface TopicAnnouncementsServerData {
  announcements: TopicAnnouncementsListData;
  contacts: SerializableTopicAnnouncementContact[];
  groups: UserGroup[];
  schedulingTimezone: string | null;
  templates: TopicAnnouncementTemplateRecord[];
  workspaceUsers: WorkspaceBasicUserRecord[];
}

interface TopicAnnouncementsData extends TopicAnnouncementsServerData {
  canSend: boolean;
  workspaceId: string;
}

const loadTopicAnnouncementsData = createServerFn({ method: 'GET' })
  .validator((data: { wsId: string }) => data)
  .handler(async ({ data }): Promise<TopicAnnouncementsServerData> => {
    const authOptions = withForwardedInternalApiAuth(getRequestHeaders());
    const [
      announcementsResponse,
      contactsResponse,
      templatesResponse,
      usersResponse,
      groupsResponse,
      calendarSettings,
    ] = await Promise.all([
      listTopicAnnouncements(
        data.wsId,
        {
          page: 1,
          pageSize: 20,
          status: 'active',
        },
        authOptions
      ),
      listTopicAnnouncementContacts(data.wsId, {}, authOptions),
      listTopicAnnouncementTemplates(data.wsId, authOptions),
      listWorkspaceBasicUsers(
        data.wsId,
        {
          from: 0,
          limit: 200,
        },
        authOptions
      ),
      listWorkspaceUserGroups(
        data.wsId,
        {
          page: 1,
          pageSize: 200,
          status: 'active',
        },
        authOptions
      ),
      getWorkspaceCalendarSettings(data.wsId, authOptions).catch(() => {
        // Calendar settings only enable scheduling. The announcements page
        // should still render drafts, previews, and sends if this optional
        // read is unavailable.
        return null;
      }),
    ]);

    return {
      announcements: {
        ...announcementsResponse,
        data: (announcementsResponse.data ?? []).map(
          toSerializableAnnouncement
        ),
      },
      contacts: (contactsResponse.data ?? []).map(toSerializableContact),
      groups: groupsResponse.data ?? [],
      schedulingTimezone: normalizeSchedulingTimezone(
        calendarSettings?.timezone
      ),
      templates: templatesResponse.data ?? [],
      workspaceUsers: usersResponse.data ?? [],
    };
  });

function toSerializableAnnouncement(
  announcement: TopicAnnouncementRecord
): SerializableTopicAnnouncementRecord {
  return {
    ...announcement,
    contacts: announcement.contacts.map(toSerializableContact),
  };
}

function toSerializableContact(
  contact: TopicAnnouncementContact
): SerializableTopicAnnouncementContact {
  return {
    ...contact,
    metadata: toSerializableJson(contact.metadata),
  };
}

function toSerializableJson(value: unknown): JsonValue | null {
  if (value === null || value === undefined) {
    return null;
  }

  try {
    const serialized = JSON.stringify(value);
    if (!serialized) {
      return null;
    }

    return JSON.parse(serialized) as JsonValue;
  } catch {
    return null;
  }
}

function isTopicAnnouncementsUnavailable(error: unknown) {
  return (
    error instanceof InternalApiError &&
    (error.status === 401 || error.status === 403 || error.status === 404)
  );
}

function normalizeSchedulingTimezone(timezone: string | null | undefined) {
  const trimmed = timezone?.trim();
  return trimmed && trimmed !== 'auto' ? trimmed : null;
}

export const Route = createFileRoute(
  '/$locale/$wsId/users/topic-announcements/announcements'
)({
  component: TopicAnnouncementsAnnouncementsRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Create, preview, send, and schedule verified topic announcements.',
      locale,
      title: 'Topic Announcements',
    });
  },
  loader: async ({ location, params }): Promise<TopicAnnouncementsData> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: getWorkspaceNextPath(
        params,
        location.pathname,
        'users/topic-announcements/announcements'
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

    try {
      const data = await loadTopicAnnouncementsData({
        data: { wsId: workspace.workspace.id },
      });

      return {
        ...data,
        canSend,
        schedulingTimezone:
          data.schedulingTimezone ??
          normalizeSchedulingTimezone(workspace.workspace.timezone),
        workspaceId: workspace.workspace.id,
      };
    } catch (error) {
      if (isTopicAnnouncementsUnavailable(error)) {
        throw notFound();
      }

      throw error;
    }
  },
  validateSearch: (search: Record<string, unknown>) => search,
});

function TopicAnnouncementsAnnouncementsRoutePage() {
  const data = Route.useLoaderData() as TopicAnnouncementsData | undefined;
  const params = Route.useParams();

  if (!data) {
    throw notFound();
  }

  return (
    <TopicAnnouncementsAnnouncementsPageClient
      canSend={data.canSend}
      initialAnnouncements={data.announcements}
      initialContacts={data.contacts}
      initialGroups={data.groups}
      initialTemplates={data.templates}
      initialWorkspaceUsers={data.workspaceUsers}
      locale={params.locale}
      schedulingTimezone={data.schedulingTimezone}
      wsId={data.workspaceId}
    />
  );
}
