import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLASS_TOPIC,
  CONTACT_ID,
  createTopicWorkspaceFixture,
  FOREIGN_WU,
  GROUP_TOPIC,
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

function row(id: string) {
  return mocks.admin.tables.topic_announcements.find(
    (announcement: { id: string }) => announcement.id === id
  );
}

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

  it.each([
    ['create_user_groups_posts'],
    ['create_user_groups_posts', 'update_user_groups_posts'],
  ])('does not let a teacher create topics (%s)', async (...permissions) => {
    grant(...permissions);
    const before = mocks.admin.tables.topic_announcements.length;
    const response = await create({ groupId: TAUGHT_GROUP, topic: 'Mine' });
    expect(response.status).toBe(403);
    expect(mocks.admin.tables.topic_announcements).toHaveLength(before);
    expect(mocks.admin.tables.topic_announcement_recipients).toEqual([]);
  });
});

describe('teacher-scoped list', () => {
  const listIds = async (url = 'http://localhost') => {
    const response = await LIST(new Request(url), params);
    expect(response.status).toBe(200);
    const { data } = await response.json();
    return (data as { id: string }[]).map((item) => item.id).sort();
  };

  it('limits teachers to their own topics and unassigned class topics', async () => {
    grant('update_user_groups_posts');
    expect(await listIds()).toEqual([OWN_TOPIC, CLASS_TOPIC].sort());
    expect(mocks.admin.orFilters).toEqual([
      {
        filter: `teacher_workspace_user_id.eq.${TEACHER_WU},and(teacher_workspace_user_id.is.null,group_id.in.(${TAUGHT_GROUP}))`,
        mode: 'select',
        table: 'topic_announcements',
      },
    ]);
  });

  it('sends the teacher scope and the search as one AND-ed filter', async () => {
    grant('update_user_groups_posts');
    row(OTHER_TOPIC).title = 'Unit 9';
    row(OWN_TOPIC).title = 'Unit 9';
    expect(await listIds('http://localhost?q=Unit%209')).toEqual([OWN_TOPIC]);
    expect(mocks.admin.orFilters).toEqual([
      {
        filter: `and(or(teacher_workspace_user_id.eq.${TEACHER_WU},and(teacher_workspace_user_id.is.null,group_id.in.(${TAUGHT_GROUP}))),or(title.ilike."%Unit 9%",topic.ilike."%Unit 9%",class_label.ilike."%Unit 9%"))`,
        mode: 'select',
        table: 'topic_announcements',
      },
    ]);
  });

  it.each([
    'x%),or(id.neq.0',
    'x%",id.neq."0',
    `a),teacher_workspace_user_id.eq.${OTHER_TEACHER_WU},(b`,
    '%',
  ])('keeps a hostile search %j inside the teacher scope', async (q) => {
    grant('update_user_groups_posts');
    const ids = await listIds(`http://localhost?q=${encodeURIComponent(q)}`);
    for (const id of ids) expect([OWN_TOPIC, CLASS_TOPIC]).toContain(id);
    expect(mocks.admin.orFilters).toHaveLength(1);
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
