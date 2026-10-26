import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONTACT_ID,
  createTopicWorkspaceFixture,
  FOREIGN_TOPIC,
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
  sendTopicAnnouncement: vi.fn(),
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
vi.mock('./email', () => ({
  sendTopicAnnouncement: mocks.sendTopicAnnouncement,
}));

const { PATCH } = await import('./announcements/[announcementId]/route');
const { POST: SEND } = await import(
  './announcements/[announcementId]/send/route'
);
const { resolveTopicAnnouncementsAccess } = await import('./server-helpers');

function grant(...permissions: string[]) {
  mocks.granted = new Set(permissions);
}

function patch(announcementId: string, body: unknown) {
  return PATCH(
    new Request('http://localhost', {
      body: JSON.stringify(body),
      method: 'PATCH',
    }),
    { params: Promise.resolve({ announcementId, wsId: WS_ID }) }
  );
}

function send(announcementId: string) {
  return SEND(new Request('http://localhost', { method: 'POST' }), {
    params: Promise.resolve({ announcementId, wsId: WS_ID }),
  });
}

function row(id: string) {
  return mocks.admin.tables.topic_announcements.find(
    (announcement: { id: string }) => announcement.id === id
  );
}

beforeEach(() => {
  mocks.admin = createTopicWorkspaceFixture();
  mocks.sendTopicAnnouncement.mockReset();
  mocks.sendTopicAnnouncement.mockResolvedValue({ auditId: 'audit-1' });
});

describe('resolveTopicAnnouncementsAccess teacher scope', () => {
  it('keeps the supervisor scope for manage_users', async () => {
    grant('manage_users');
    const access = await resolveTopicAnnouncementsAccess(
      new Request('http://localhost'),
      WS_ID,
      { requireManage: true, teacherAccess: 'update' }
    );
    expect(access.context?.scope).toEqual({ kind: 'manager' });
  });

  it('scopes a teacher to their linked user and TEACHER groups only', async () => {
    grant('update_user_groups_posts');
    const access = await resolveTopicAnnouncementsAccess(
      new Request('http://localhost'),
      WS_ID,
      { requireManage: true, teacherAccess: 'update' }
    );
    expect(access.context?.scope).toEqual({
      groupIds: [TAUGHT_GROUP],
      kind: 'teacher',
      workspaceUserId: TEACHER_WU,
    });
  });

  it('denies routes that do not opt into the teacher scope', async () => {
    grant('update_user_groups_posts', 'create_user_groups_posts');
    const access = await resolveTopicAnnouncementsAccess(
      new Request('http://localhost'),
      WS_ID,
      { requireManage: true }
    );
    expect(access.response?.status).toBe(403);
  });

  it('denies a teacher without the matching post permission', async () => {
    grant('create_user_groups_posts');
    const access = await resolveTopicAnnouncementsAccess(
      new Request('http://localhost'),
      WS_ID,
      { requireManage: true, teacherAccess: 'update' }
    );
    expect(access.response?.status).toBe(403);
  });

  it('denies a teacher whose account is not linked to a workspace user', async () => {
    grant('update_user_groups_posts');
    mocks.admin.tables.workspace_user_linked_users = [];
    const access = await resolveTopicAnnouncementsAccess(
      new Request('http://localhost'),
      WS_ID,
      { requireManage: true, teacherAccess: 'update' }
    );
    expect(access.response?.status).toBe(403);
  });
});

describe('teacher-scoped PATCH', () => {
  beforeEach(() => grant('update_user_groups_posts'));

  it('lets the assigned teacher save a draft and recomputes the deadline', async () => {
    const response = await patch(OWN_TOPIC, {
      courseBook: 'Book 2',
      sessionDate: '2026-11-10',
      status: 'draft',
      topic: 'Unit 4: food',
      videoUrl: 'https://video.example.com/watch?v=1',
    });
    expect(response.status).toBe(200);
    expect(row(OWN_TOPIC)).toMatchObject({
      course_book: 'Book 2',
      send_due_at: '2026-11-09T11:30:00.000Z',
      topic: 'Unit 4: food',
      video_url: 'https://video.example.com/watch?v=1',
    });
  });

  it('allows a TEACHER of the class even when another teacher is assigned', async () => {
    const response = await patch(GROUP_TOPIC, { topic: 'Class topic' });
    expect(response.status).toBe(200);
    expect(row(GROUP_TOPIC).topic).toBe('Class topic');
    expect(row(GROUP_TOPIC).send_due_at).toBeUndefined();
  });

  it('denies another teacher topic (cross-teacher)', async () => {
    const response = await patch(OTHER_TOPIC, { topic: 'Hijack' });
    expect(response.status).toBe(404);
    expect(row(OTHER_TOPIC).topic).toBe('Existing topic');
  });

  it('denies a class where the teacher is not a TEACHER (unassigned group)', async () => {
    const response = await patch(STUDENT_TOPIC, { topic: 'Hijack' });
    expect(response.status).toBe(404);
  });

  it('denies a topic in another workspace (cross-workspace)', async () => {
    const response = await patch(FOREIGN_TOPIC, { topic: 'Hijack' });
    expect(response.status).toBe(404);
    expect(row(FOREIGN_TOPIC).topic).toBe('Existing topic');
  });

  it.each<[Record<string, unknown>, string]>([
    [{ teacherWorkspaceUserId: OTHER_TEACHER_WU }, 'reassign'],
    [{ groupId: OTHER_GROUP }, 'move to an untaught class'],
    [{ status: 'queued', topic: 'Ready' }, 'leave draft'],
    [{ contactIds: [CONTACT_ID] }, 'change recipients'],
  ])('forbids teachers to %j (%s)', async (body) => {
    const response = await patch(OWN_TOPIC, body);
    expect(response.status).toBe(403);
  });

  it('rejects a non-https video link', async () => {
    const response = await patch(OWN_TOPIC, {
      videoUrl: 'http://video.example.com',
    });
    expect(response.status).toBe(400);
  });
});

describe('supervisor PATCH', () => {
  beforeEach(() => grant('manage_users'));

  it('assigns a teacher from the same workspace', async () => {
    const response = await patch(OTHER_TOPIC, {
      teacherWorkspaceUserId: TEACHER_WU,
    });
    expect(response.status).toBe(200);
    expect(row(OTHER_TOPIC).teacher_workspace_user_id).toBe(TEACHER_WU);
  });

  it('rejects a teacher from another workspace with a 400', async () => {
    const response = await patch(OTHER_TOPIC, {
      teacherWorkspaceUserId: FOREIGN_WU,
    });
    expect(response.status).toBe(400);
    expect(row(OTHER_TOPIC).teacher_workspace_user_id).toBe(OTHER_TEACHER_WU);
  });

  it('keeps a blank topic only while the announcement is a draft', async () => {
    expect((await patch(OTHER_TOPIC, { topic: '' })).status).toBe(200);
    const response = await patch(OTHER_TOPIC, { status: 'queued' });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: 'TOPIC_REQUIRED',
    });
  });

  it('leaves omitted fields untouched', async () => {
    await patch(OTHER_TOPIC, { title: 'Renamed' });
    expect(row(OTHER_TOPIC)).toMatchObject({
      group_id: OTHER_GROUP,
      title: 'Renamed',
      topic: 'Existing topic',
    });
  });
});

describe('teacher-scoped send', () => {
  it('sends the assigned topic with send_user_group_post_emails', async () => {
    grant('send_user_group_post_emails');
    const response = await send(OWN_TOPIC);
    expect(response.status).toBe(200);
    expect(mocks.sendTopicAnnouncement).toHaveBeenCalledWith(
      expect.objectContaining({ announcementId: OWN_TOPIC })
    );
  });

  it('does not send another teacher topic', async () => {
    grant('send_user_group_post_emails');
    const response = await send(OTHER_TOPIC);
    expect(response.status).toBe(404);
    expect(mocks.sendTopicAnnouncement).not.toHaveBeenCalled();
  });

  it('requires the send permission for teachers', async () => {
    grant('update_user_groups_posts', 'create_user_groups_posts');
    expect((await send(OWN_TOPIC)).status).toBe(403);
  });

  it('keeps supervisors requiring manage_users and send together', async () => {
    grant('manage_users');
    expect((await send(OTHER_TOPIC)).status).toBe(403);
    grant('manage_users', 'send_user_group_post_emails');
    expect((await send(OTHER_TOPIC)).status).toBe(200);
  });
});
