import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONTACT_ID,
  createTopicWorkspaceFixture,
  OTHER_TEACHER_WU,
  OTHER_TOPIC,
  OWN_TOPIC,
  TEACHER_PLATFORM_ID,
  TEACHER_WU,
  WS_ID,
} from './topic-announcement-fake-supabase.test-helper';

/**
 * Regression for live workspaces: with ENABLE_TOPIC_TEACHER_ASSIGNMENTS off
 * (the default), the supervisor create -> send flow behaves as before the
 * teacher-assignment feature.
 */
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
  getSecret: vi.fn((name: string, rows: { name: string; value: string }[]) =>
    rows.find((row) => row.name === name)
  ),
  // Only the existing module flag: teacher assignments are not configured.
  getSecrets: vi.fn(async () => [
    { name: 'ENABLE_TOPIC_ANNOUNCEMENTS', value: 'true' },
  ]),
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

const { GET: LIST, POST: CREATE } = await import(
  '@/app/api/v1/workspaces/[wsId]/topic-announcements/route'
);
const { POST: NOTIFY } = await import(
  '@/app/api/v1/workspaces/[wsId]/topic-announcements/notify-teachers/route'
);
const { PATCH } = await import('./announcements/[announcementId]/route');
const { POST: SEND } = await import(
  './announcements/[announcementId]/send/route'
);
const { POST: IMPORT } = await import('./import/route');

const params = { params: Promise.resolve({ wsId: WS_ID }) };

function grant(...permissions: string[]) {
  mocks.granted = new Set(permissions);
}

function row(id: string) {
  return mocks.admin.tables.topic_announcements.find(
    (announcement: { id: string }) => announcement.id === id
  );
}

function json(body: unknown, method = 'POST') {
  return new Request('http://localhost', {
    body: JSON.stringify(body),
    method,
  });
}

function create(body: Record<string, unknown>) {
  return CREATE(
    json({
      contactIds: [CONTACT_ID],
      sessionDate: '2026-11-05',
      startTime: '18:30',
      title: 'Session',
      ...body,
    }),
    params
  );
}

beforeEach(() => {
  mocks.admin = createTopicWorkspaceFixture();
  mocks.sendTopicAnnouncement.mockReset();
  mocks.sendTopicAnnouncement.mockResolvedValue({
    auditId: 'audit-1',
    messageId: 'message-1',
  });
  grant('manage_users', 'send_user_group_post_emails');
});

describe('supervisor flow with teacher assignments off', () => {
  it('still requires a topic to create, even for a draft', async () => {
    const before = mocks.admin.tables.topic_announcements.length;
    for (const body of [{}, { topic: '   ' }, { status: 'draft', topic: '' }]) {
      const response = await create(body);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        message: 'Invalid request',
      });
    }
    expect(mocks.admin.tables.topic_announcements).toHaveLength(before);
  });

  it('creates and sends exactly as before, ignoring teacher-only fields', async () => {
    const response = await create({
      courseBook: 'Starter',
      teacherWorkspaceUserId: OTHER_TEACHER_WU,
      topic: 'Weekend plans',
      videoUrl: 'https://video.example.com/1',
    });
    expect(response.status).toBe(201);
    const { data } = await response.json();
    expect(data).toMatchObject({
      course_book: null,
      send_due_at: null,
      status: 'draft',
      teacher_workspace_user_id: null,
      topic: 'Weekend plans',
      video_url: null,
    });
    expect(mocks.admin.rpc).not.toHaveBeenCalled();

    const sent = await SEND(json({}), {
      params: Promise.resolve({ announcementId: data.id, wsId: WS_ID }),
    });
    expect(sent.status).toBe(200);
    await expect(sent.json()).resolves.toEqual({
      auditId: 'audit-1',
      messageId: 'message-1',
    });
    expect(mocks.sendTopicAnnouncement).toHaveBeenCalledWith(
      expect.objectContaining({ announcementId: data.id, resend: false })
    );
  });

  it('keeps update rules: topic required when written, no deadline', async () => {
    const patch = (body: unknown) =>
      PATCH(json(body, 'PATCH'), {
        params: Promise.resolve({ announcementId: OTHER_TOPIC, wsId: WS_ID }),
      });
    expect((await patch({ topic: '' })).status).toBe(400);
    expect(row(OTHER_TOPIC).topic).toBe('Existing topic');

    const response = await patch({
      sessionDate: '2026-11-10',
      teacherWorkspaceUserId: TEACHER_WU,
      title: 'Renamed',
    });
    expect(response.status).toBe(200);
    expect(row(OTHER_TOPIC)).toMatchObject({
      session_date: '2026-11-10',
      teacher_workspace_user_id: OTHER_TEACHER_WU,
      title: 'Renamed',
    });
    expect(row(OTHER_TOPIC).send_due_at).toBeUndefined();
  });

  it('imports rows without a send deadline', async () => {
    const response = await IMPORT(
      json({
        rows: [
          {
            contactEmail: 'g@example.com',
            contactName: 'G',
            rowNumber: 1,
            sessionDate: '2026-11-05',
            startTime: '18:30',
            title: 'Imported',
            topic: 'Imported topic',
          },
        ],
        sourceType: 'foreign_teacher_schedule',
      }),
      params
    );
    expect(response.status).toBeLessThan(300);
    const imported = mocks.admin.tables.topic_announcements.filter(
      (announcement: { title: string }) => announcement.title === 'Imported'
    );
    expect(imported).toHaveLength(1);
    expect(imported[0].send_due_at ?? null).toBeNull();
  });

  it('exposes no teacher scope or notify route', async () => {
    grant('update_user_groups_posts', 'create_user_groups_posts');
    expect((await LIST(new Request('http://localhost'), params)).status).toBe(
      403
    );
    const patched = await PATCH(json({ topic: 'Teacher edit' }, 'PATCH'), {
      params: Promise.resolve({ announcementId: OWN_TOPIC, wsId: WS_ID }),
    });
    expect(patched.status).toBe(403);
    expect(row(OWN_TOPIC).topic).toBe('Existing topic');

    grant('manage_users', 'send_user_group_post_emails');
    const notify = await NOTIFY(json({ announcementIds: [OWN_TOPIC] }), params);
    expect(notify.status).toBe(404);
    expect(mocks.admin.rpc).not.toHaveBeenCalled();
  });
});
