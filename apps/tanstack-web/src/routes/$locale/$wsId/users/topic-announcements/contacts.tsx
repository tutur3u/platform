import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  InternalApiError,
  listTopicAnnouncementContacts,
  listWorkspaceBasicUsers,
  type TopicAnnouncementContact,
  type WorkspaceBasicUserRecord,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { TopicAnnouncementsContactsPageClient } from '../../../../../components/users/topic-announcements/contacts/contacts-page-client';
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

interface TopicAnnouncementsContactsServerData {
  contacts: SerializableTopicAnnouncementContact[];
  workspaceUsers: WorkspaceBasicUserRecord[];
}

interface TopicAnnouncementsContactsData {
  canSend: boolean;
  contacts: SerializableTopicAnnouncementContact[];
  workspaceId: string;
  workspaceUsers: WorkspaceBasicUserRecord[];
}

const loadTopicAnnouncementsContactsData = createServerFn({ method: 'GET' })
  .validator((data: { wsId: string }) => data)
  .handler(async ({ data }): Promise<TopicAnnouncementsContactsServerData> => {
    const authOptions = withForwardedInternalApiAuth(getRequestHeaders());
    const [contactsResponse, usersResponse] = await Promise.all([
      listTopicAnnouncementContacts(data.wsId, {}, authOptions),
      listWorkspaceBasicUsers(
        data.wsId,
        {
          from: 0,
          limit: 200,
        },
        authOptions
      ),
    ]);

    return {
      contacts: (contactsResponse.data ?? []).map(toSerializableContact),
      workspaceUsers: usersResponse.data ?? [],
    };
  });

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

export const Route = createFileRoute(
  '/$locale/$wsId/users/topic-announcements/contacts'
)({
  component: TopicAnnouncementsContactsRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Manage topic announcement contacts and their verification status.',
      locale,
      title: 'Topic Announcement Contacts',
    });
  },
  loader: async ({
    location,
    params,
  }): Promise<TopicAnnouncementsContactsData> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: getWorkspaceNextPath(
        params,
        location.pathname,
        'users/topic-announcements/contacts'
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
      const data = await loadTopicAnnouncementsContactsData({
        data: { wsId: workspace.workspace.id },
      });

      return {
        canSend,
        contacts: data.contacts,
        workspaceId: workspace.workspace.id,
        workspaceUsers: data.workspaceUsers,
      };
    } catch (error) {
      if (isTopicAnnouncementsUnavailable(error)) {
        throw notFound();
      }

      throw error;
    }
  },
});

function TopicAnnouncementsContactsRoutePage() {
  const data = Route.useLoaderData() as
    | TopicAnnouncementsContactsData
    | undefined;

  if (!data) {
    throw notFound();
  }

  return (
    <TopicAnnouncementsContactsPageClient
      canSend={data.canSend}
      initialContacts={data.contacts}
      initialWorkspaceUsers={data.workspaceUsers}
      wsId={data.workspaceId}
    />
  );
}
