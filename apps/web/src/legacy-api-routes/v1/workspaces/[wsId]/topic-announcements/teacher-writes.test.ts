import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONTACT_ID,
  createTopicWorkspaceFixture,
  FOREIGN_WU,
  GROUP_TOPIC,
  OTHER_GROUP,
  OTHER_TEACHER_WU,
  OTHER_TOPIC,
  OWN_TOPIC,
  STUDENT_TOPIC,
  TAUGHT_GROUP,
  TEACHER_PLATFORM_ID,
  TEACHER_WU,
  WS_ID,
} from './topic-announcement-fake-supabase.test-helper';

const mocks = vi.hoisted(() => ({
  admin: null as any,
  granted: new Set<string>(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => mocks.admin),
  createClient: vi.fn(async () => mocks.admin),
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: vi.fn(async () => ({
    user: { id: TEACHER_PLATFORM_ID },
  })),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: vi.fn(async () => ({
    withoutPermission: (permission: string) => !mocks.granted.has(permission),
  })),
  getSecret: vi.fn(() => ({ value: 'true' })),
  getSecrets: vi.fn(async () => []),
  normalizeWorkspaceId: vi.fn(async (wsId: string) => wsId),
}));
vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  downloadWorkspaceStorageObjectForProvider: vi.fn(),
  getWorkspaceStorageObjectMetadataForProvider: vi.fn(),
  WorkspaceStorageError: class extends Error {},
}));

const { GET: LIST, POST: CREATE } = await import(
  '@/app/api/v1/workspaces/[wsId]/topic-announcements/route'
);
const { POST: IMPORT } = await import('./import/route');
const { notifyTopicAnnouncementTeachers } = await import(
  '@/lib/topic-announcement-teacher-notifications'
);

const params = { params: Promise.resolve({ wsId: WS_ID }) };

function grant(...permissions: string[]) {
  mocks.granted = new Set(permissions);
}

function create(body: Record<string, unknown>) {
  return CREATE(
    new Request('http://localhost', {
      body: JSON.stringify({
        contactIds: [CONTACT_ID],
        sessionDate: '2026-11-05',
        startTime: '18:30',
        title: 'Session',
        ...body,
      }),
      method: 'POST',
    }),
    params
  );
}

beforeEach(() => {
  mocks.admin = createTopicWorkspaceFixture();
});

describe('create with teacher fields', () => {
  it('lets a supervisor create a draft session with no topic yet', async () => {
    grant('manage_users');
    const response = await create({
      courseBook: 'Starter',
      teacherWorkspaceUserId: OTHER_TEACHER_WU,
    });
    expect(response.status).toBe(201);
    const { data } = await response.json();
    expect(data).toMatchObject({
      course_book: 'Starter',
      send_due_at: '2026-11-04T11:30:00.000Z',
      status: 'draft',
      teacher_workspace_user_id: OTHER_TEACHER_WU,
      topic: '',
    });
  });

  it('requires a topic when the announcement is not a draft', async () => {
    grant('manage_users');
    expect((await create({ status: 'queued' })).status).toBe(400);
  });

  it('rejects a teacher from another workspace with a 400', async () => {
    grant('manage_users');
    const response = await create({ teacherWorkspaceUserId: FOREIGN_WU });
    expect(response.status).toBe(400);
  });

  it('assigns a teacher-created topic to that teacher', async () => {
    grant('create_user_groups_posts');
    const response = await create({ groupId: TAUGHT_GROUP, topic: 'Mine' });
    expect(response.status).toBe(201);
    const { data } = await response.json();
    expect(data.teacher_workspace_user_id).toBe(TEACHER_WU);
  });

  it.each([
    { teacherWorkspaceUserId: OTHER_TEACHER_WU },
    { groupId: OTHER_GROUP },
  ])(
    'forbids a teacher create that escapes their assignment %j',
    async (body) => {
      grant('create_user_groups_posts');
      expect((await create(body)).status).toBe(403);
    }
  );
});

describe('teacher-scoped list', () => {
  it('limits teachers to their own and their classes topics', async () => {
    grant('update_user_groups_posts');
    const response = await LIST(new Request('http://localhost'), params);
    expect(response.status).toBe(200);
    expect(mocks.admin.orFilters).toContainEqual({
      filter: `teacher_workspace_user_id.eq.${TEACHER_WU},group_id.in.(${TAUGHT_GROUP})`,
      table: 'topic_announcements',
    });
  });

  it('does not filter the supervisor list', async () => {
    grant('manage_users');
    await LIST(new Request('http://localhost'), params);
    expect(mocks.admin.orFilters).toEqual([]);
  });
});

describe('import deadline', () => {
  it('stores send_due_at for imported rows in the workspace timezone', async () => {
    grant('manage_users');
    const response = await IMPORT(
      new Request('http://localhost', {
        body: JSON.stringify({
          rows: [
            {
              contactEmail: 'g@example.com',
              sessionDate: '2026-11-05',
              startTime: '6:30 PM',
              topic: 'Imported',
            },
            { contactEmail: 'g@example.com', topic: 'No date' },
          ],
        }),
        method: 'POST',
      }),
      params
    );
    expect(response.status).toBe(200);
    const imported = mocks.admin.tables.topic_announcements.filter(
      (row: { topic: string }) =>
        row.topic === 'Imported' || row.topic === 'No date'
    );
    expect(
      imported.map((row: { send_due_at: string | null }) => row.send_due_at)
    ).toEqual(['2026-11-04T11:30:00.000Z', null]);
  });
});

describe('notifyTopicAnnouncementTeachers', () => {
  it('notifies each linked teacher once and counts unlinked teachers', async () => {
    const result = await notifyTopicAnnouncementTeachers({
      actorUserId: 'supervisor',
      announcementIds: [OWN_TOPIC, GROUP_TOPIC, OTHER_TOPIC, STUDENT_TOPIC],
      normalizedWsId: WS_ID,
      sbAdmin: mocks.admin,
    });

    expect(result).toEqual({
      failedTeachers: 0,
      notifiedTeachers: 1,
      skippedUnlinkedTeachers: 1,
      unassignedAnnouncements: 1,
    });
    expect(mocks.admin.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.admin.rpc).toHaveBeenCalledWith(
      'create_notification',
      expect.objectContaining({
        p_entity_id: OWN_TOPIC,
        p_type: 'topic_assigned',
        p_user_id: TEACHER_PLATFORM_ID,
        p_ws_id: WS_ID,
      })
    );
  });
});
