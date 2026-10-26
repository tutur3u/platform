import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLASS_TOPIC,
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
  teacherAssignments: true,
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
  getSecrets: vi.fn(async () => [
    { name: 'ENABLE_TOPIC_ANNOUNCEMENTS', value: 'true' },
    {
      name: 'ENABLE_TOPIC_TEACHER_ASSIGNMENTS',
      value: mocks.teacherAssignments ? 'true' : 'false',
    },
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

const { PATCH } = await import('./announcements/[announcementId]/route');
const { POST: SEND } = await import(
  './announcements/[announcementId]/send/route'
);
const { resolveTopicAnnouncementsAccess } = await import('./server-helpers');
const { POST: SEND_BULK } = await import('./send-bulk/route');

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

function send(announcementId: string, body?: unknown) {
  return SEND(
    new Request('http://localhost', {
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      method: 'POST',
    }),
    { params: Promise.resolve({ announcementId, wsId: WS_ID }) }
  );
}

const ATTACHMENT_DRAFT = {
  contentType: 'image/png',
  fileName: 'page.png',
  sizeBytes: 100,
  storagePath: `${WS_ID}/topic-announcements/attachments/page.png`,
  storageProvider: 'supabase',
};

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

  it('lets the assigned teacher save the topic content as a draft', async () => {
    const response = await patch(OWN_TOPIC, {
      body: 'Objectives',
      courseBook: 'Book 2',
      status: 'draft',
      topic: 'Unit 4: food',
      videoUrl: 'https://video.example.com/watch?v=1',
    });
    expect(response.status).toBe(200);
    expect(row(OWN_TOPIC)).toMatchObject({
      body: 'Objectives',
      course_book: 'Book 2',
      topic: 'Unit 4: food',
      video_url: 'https://video.example.com/watch?v=1',
    });
    expect(row(OWN_TOPIC).send_due_at).toBeUndefined();
  });

  it('lets a TEACHER of the class edit a topic with no assigned teacher', async () => {
    const response = await patch(CLASS_TOPIC, { topic: 'Class topic' });
    expect(response.status).toBe(200);
    expect(row(CLASS_TOPIC).topic).toBe('Class topic');
  });

  it('denies a co-teacher a class topic assigned to another teacher', async () => {
    const response = await patch(GROUP_TOPIC, { topic: 'Hijack' });
    expect(response.status).toBe(404);
    expect(row(GROUP_TOPIC).topic).toBe('Existing topic');
  });

  it('cannot move its own deadline through the schedule fields', async () => {
    const response = await patch(OWN_TOPIC, {
      sessionDate: '2026-12-31',
      startTime: '23:00',
    });
    expect(response.status).toBe(403);
    expect(row(OWN_TOPIC)).toMatchObject({
      session_date: '2026-11-05',
      start_time: '18:30:00',
    });
    expect(row(OWN_TOPIC).send_due_at).toBeUndefined();
  });

  it('re-checks the assignment in the update itself', async () => {
    const originalFrom = mocks.admin.from;
    let loads = 0;
    mocks.admin.from = (table: string) => {
      const chain = originalFrom(table);
      if (table !== 'topic_announcements') return chain;
      const maybeSingle = chain.maybeSingle;
      chain.maybeSingle = async () => {
        const result = await maybeSingle();
        loads += 1;
        if (loads === 1) {
          // Return a snapshot, as PostgREST would, then let a supervisor
          // reassign the topic before the teacher's write lands.
          const snapshot = {
            ...result,
            data: result.data ? { ...result.data } : null,
          };
          row(OWN_TOPIC).teacher_workspace_user_id = OTHER_TEACHER_WU;
          return snapshot;
        }
        return result;
      };
      return chain;
    };
    const response = await patch(OWN_TOPIC, { topic: 'Late write' });
    expect(response.status).toBe(404);
    expect(row(OWN_TOPIC).topic).toBe('Existing topic');
    expect(mocks.admin.orFilters).toContainEqual(
      expect.objectContaining({ mode: 'update', table: 'topic_announcements' })
    );
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
    [{ teacherWorkspaceUserId: TEACHER_WU }, 'restate the assignment'],
    [{ groupId: OTHER_GROUP }, 'move to an untaught class'],
    [{ groupId: TAUGHT_GROUP }, 'move to a taught class'],
    [{ status: 'queued', topic: 'Ready' }, 'leave draft'],
    [{ contactIds: [CONTACT_ID] }, 'change recipients'],
    [{ title: 'Renamed' }, 'rename'],
    [{ classLabel: 'B2' }, 'relabel the class'],
    [{ room: '9' }, 'change the room'],
    [{ place: 'Campus 2' }, 'change the place'],
    [{ dayLabel: 'Sunday' }, 'change the day'],
    [{ sourceType: 'import' }, 'change the source'],
    [{ sessionDate: '2026-12-01' }, 'change the date'],
    [{ startTime: '07:00' }, 'change the start time'],
    [{ endTime: '23:00' }, 'change the end time'],
  ])('forbids teachers to %j (%s)', async (body) => {
    const before = { ...row(OWN_TOPIC) };
    const response = await patch(OWN_TOPIC, { topic: 'Allowed', ...body });
    expect(response.status).toBe(403);
    expect(row(OWN_TOPIC)).toEqual(before);
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

  it('recomputes the deadline when the schedule changes', async () => {
    const response = await patch(OTHER_TOPIC, { sessionDate: '2026-11-10' });
    expect(response.status).toBe(200);
    expect(row(OTHER_TOPIC).send_due_at).toBe('2026-11-09T11:30:00.000Z');
  });

  it('notifies the newly assigned teacher on reassignment', async () => {
    const response = await patch(OTHER_TOPIC, {
      teacherWorkspaceUserId: TEACHER_WU,
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      teacherNotification: { notifiedTeachers: 1 },
    });
    expect(mocks.admin.rpc).toHaveBeenCalledWith(
      'create_notification',
      expect.objectContaining({
        p_entity_id: OTHER_TOPIC,
        p_type: 'topic_assigned',
        p_user_id: TEACHER_PLATFORM_ID,
      })
    );
  });

  it('does not notify when the teacher is unchanged', async () => {
    const response = await patch(OTHER_TOPIC, {
      teacherWorkspaceUserId: OTHER_TEACHER_WU,
      title: 'Renamed',
    });
    expect(response.status).toBe(200);
    expect(mocks.admin.rpc).not.toHaveBeenCalled();
  });

  it('does not attach a file that is already attached', async () => {
    mocks.admin.tables.topic_announcement_attachments.push({
      announcement_id: OTHER_TOPIC,
      id: 'attachment-1',
      size_bytes: 100,
      storage_path: ATTACHMENT_DRAFT.storagePath,
      ws_id: WS_ID,
    });
    const response = await patch(OTHER_TOPIC, {
      attachmentDrafts: [ATTACHMENT_DRAFT, ATTACHMENT_DRAFT],
    });
    expect(response.status).toBe(200);
    expect(mocks.admin.tables.topic_announcement_attachments).toHaveLength(1);
  });

  it.each(['sent', 'processing'])(
    'refuses new attachments on a %s topic',
    async (status) => {
      row(OTHER_TOPIC).status = status;
      const response = await patch(OTHER_TOPIC, {
        attachmentDrafts: [ATTACHMENT_DRAFT],
      });
      expect(response.status).toBe(409);
      expect(mocks.admin.tables.topic_announcement_attachments).toEqual([]);
    }
  );

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

  it('does not let a teacher resend', async () => {
    grant('send_user_group_post_emails');
    const response = await send(OWN_TOPIC, { resend: true });
    expect(response.status).toBe(403);
    expect(mocks.sendTopicAnnouncement).not.toHaveBeenCalled();
  });

  it('does not let a teacher bulk-resend', async () => {
    grant('send_user_group_post_emails');
    const response = await SEND_BULK(
      new Request('http://localhost', {
        body: JSON.stringify({ announcementIds: [OWN_TOPIC], resend: true }),
        method: 'POST',
      }),
      { params: Promise.resolve({ wsId: WS_ID }) }
    );
    expect(response.status).toBe(403);
    expect(mocks.sendTopicAnnouncement).not.toHaveBeenCalled();
  });

  it('lets a supervisor resend', async () => {
    grant('manage_users', 'send_user_group_post_emails');
    const response = await send(OTHER_TOPIC, { resend: true });
    expect(response.status).toBe(200);
    expect(mocks.sendTopicAnnouncement).toHaveBeenCalledWith(
      expect.objectContaining({ resend: true })
    );
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
