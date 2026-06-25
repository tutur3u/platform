import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  getWorkspaceCalendarSettings,
  InternalApiError,
  listTopicAnnouncements,
  type TopicAnnouncementContact,
  type TopicAnnouncementRecord,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { TopicAnnouncementsDeliveryPageClient } from '../../../../../components/users/topic-announcements/delivery/delivery-page-client';
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

interface TopicAnnouncementsDeliveryListData {
  count: number;
  data: SerializableTopicAnnouncementRecord[];
  page: number;
  pageSize: number;
  totalPages: number;
}

interface TopicAnnouncementsDeliveryServerData {
  announcements: TopicAnnouncementsDeliveryListData;
  schedulingTimezone: string | null;
}

interface TopicAnnouncementsDeliveryData {
  initialAnnouncements: TopicAnnouncementsDeliveryListData;
  schedulingTimezone: string | null;
  workspaceId: string;
}

const loadTopicAnnouncementsDeliveryData = createServerFn({ method: 'GET' })
  .validator((data: { wsId: string }) => data)
  .handler(async ({ data }): Promise<TopicAnnouncementsDeliveryServerData> => {
    const authOptions = withForwardedInternalApiAuth(getRequestHeaders());
    const [announcementsResponse, calendarSettings] = await Promise.all([
      listTopicAnnouncements(
        data.wsId,
        { page: 1, pageSize: 100, status: 'sent' },
        authOptions
      ),
      getWorkspaceCalendarSettings(data.wsId, authOptions).catch(() => {
        // Calendar settings only refine timestamp display. Delivery history
        // should still render from announcement data when that optional read
        // is unavailable or temporarily failing.
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
      schedulingTimezone: normalizeSchedulingTimezone(
        calendarSettings?.timezone
      ),
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
  '/$locale/$wsId/users/topic-announcements/delivery'
)({
  component: TopicAnnouncementsDeliveryRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Review delivered topic announcements and recipient delivery history.',
      locale,
      title: 'Topic Announcement Delivery',
    });
  },
  loader: async ({
    location,
    params,
  }): Promise<TopicAnnouncementsDeliveryData> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: getWorkspaceNextPath(
        params,
        location.pathname,
        'users/topic-announcements/delivery'
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
      const data = await loadTopicAnnouncementsDeliveryData({
        data: { wsId: workspace.workspace.id },
      });

      return {
        initialAnnouncements: data.announcements,
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
});

function TopicAnnouncementsDeliveryRoutePage() {
  const data = Route.useLoaderData() as
    | TopicAnnouncementsDeliveryData
    | undefined;
  const params = Route.useParams();

  if (!data) {
    throw notFound();
  }

  return (
    <TopicAnnouncementsDeliveryPageClient
      initialAnnouncements={data.initialAnnouncements}
      locale={params.locale}
      schedulingTimezone={data.schedulingTimezone}
      wsId={data.workspaceId}
    />
  );
}
