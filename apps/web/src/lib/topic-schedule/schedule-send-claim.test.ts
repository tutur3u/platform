import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createScheduleFixture,
  GVNN,
  GVNN_2,
  K1,
  SUPERVISOR,
  WS,
} from './schedule-fixture.test-helper';

const mocks = vi.hoisted(() => ({
  admin: null as any,
  sendTopicAnnouncement: vi.fn(),
  teacherAssignments: true,
}));

vi.mock(
  '@/legacy-api-routes/v1/workspaces/[wsId]/topic-announcements/email',
  () => ({ sendTopicAnnouncement: mocks.sendTopicAnnouncement })
);

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => mocks.admin),
  createClient: vi.fn(async () => mocks.admin),
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: vi.fn(async () => ({
    user: { id: SUPERVISOR },
  })),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: vi.fn(async () => ({
    withoutPermission: (permission: string) =>
      !['manage_users', 'send_user_group_post_emails'].includes(permission),
  })),
  getSecret: vi.fn((name: string, rows: { name: string; value: string }[]) =>
    rows.find((row) => row.name === name)
  ),
  getSecrets: vi.fn(async () => [
    { name: 'ENABLE_TOPIC_ANNOUNCEMENTS', value: 'true' },
    ...(mocks.teacherAssignments
      ? [{ name: 'ENABLE_TOPIC_TEACHER_ASSIGNMENTS', value: 'true' }]
      : []),
  ]),
  normalizeWorkspaceId: vi.fn(async (wsId: string) => wsId),
}));
vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  downloadWorkspaceStorageObjectForProvider: vi.fn(),
  getWorkspaceStorageObjectMetadataForProvider: vi.fn(),
  WorkspaceStorageError: class extends Error {},
}));

const { PUT } = await import(
  '@/app/api/v1/workspaces/[wsId]/topic-announcements/schedule/route'
);
const { POST: SEND } = await import(
  '@/legacy-api-routes/v1/workspaces/[wsId]/topic-announcements/announcements/[announcementId]/send/route'
);
const { POST: SEND_BULK } = await import(
  '@/legacy-api-routes/v1/workspaces/[wsId]/topic-announcements/send-bulk/route'
);

const params = { params: Promise.resolve({ wsId: WS }) };

function request(body: unknown, method = 'POST') {
  return new Request('http://localhost', {
    body: JSON.stringify(body),
    method,
  });
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    durationMinutes: 30,
    groupId: K1,
    gvnnContactId: GVNN,
    sessionDate: '2026-10-13',
    startTime: '17:30',
    ...overrides,
  };
}

function save(sessions: unknown[]) {
  return PUT(
    request({ deleteIds: [], month: '2026-10', sessions }, 'PUT'),
    params
  );
}

function send(id: string, body: Record<string, unknown> = {}) {
  return SEND(request(body), {
    params: Promise.resolve({ announcementId: id, wsId: WS }),
  });
}

const row = (id: string) =>
  mocks.admin.tables.topic_announcements.find(
    (item: { id: string }) => item.id === id
  );

const recipientIds = () =>
  mocks.admin.tables.topic_announcement_recipients.map(
    (item: { contact_id: string }) => item.contact_id
  );

async function created() {
  const { data } = await (await save([session()])).json();
  return data.createdIds[0] as string;
}

/** What the real sender does on success. */
function sendsAndMarksSent(id: string) {
  return async () => {
    row(id).status = 'sent';
    row(id).sent_at = '2026-10-12T00:00:00.000Z';
    return { auditId: 'audit-1', messageId: 'message-1' };
  };
}

beforeEach(() => {
  mocks.admin = createScheduleFixture();
  mocks.teacherAssignments = true;
  mocks.sendTopicAnnouncement.mockReset();
});

describe('Send now on a schedule session', () => {
  it('claims the session before the send reads its recipients', async () => {
    const id = await created();
    let statusDuringSend: string | undefined;
    mocks.sendTopicAnnouncement.mockImplementation(async () => {
      statusDuringSend = row(id).status;
      return sendsAndMarksSent(id)();
    });
    expect((await send(id)).status).toBe(200);
    expect(statusDuringSend).toBe('processing');
    expect(row(id).status).toBe('sent');
  });

  it('keeps the GVNN it read when a schedule save races it', async () => {
    const id = await created();
    let raced: Response | undefined;
    mocks.sendTopicAnnouncement.mockImplementation(async () => {
      raced = await save([session({ gvnnContactId: GVNN_2, id })]);
      return sendsAndMarksSent(id)();
    });
    await send(id);
    // The claimed session fails validation: nothing is written.
    expect(raced?.status).toBe(400);
    await expect(raced?.json()).resolves.toMatchObject({
      rowErrors: [{ code: 'locked', sessionId: id }],
    });
    expect(recipientIds()).toEqual([GVNN]);
  });

  it('releases the claim when the send refuses or throws', async () => {
    const id = await created();
    mocks.sendTopicAnnouncement.mockResolvedValueOnce({
      error: 'NO_RECIPIENTS',
      status: 409,
    });
    const refused = await send(id);
    expect(refused.status).toBe(409);
    expect(row(id).status).toBe('draft');

    mocks.sendTopicAnnouncement.mockRejectedValueOnce(new Error('boom'));
    await expect(send(id)).rejects.toThrow('boom');
    expect(row(id).status).toBe('draft');
  });

  it('restores exactly the status it claimed', async () => {
    const id = await created();
    row(id).status = 'failed';
    mocks.sendTopicAnnouncement.mockResolvedValueOnce({
      error: 'NO_RECIPIENTS',
      status: 409,
    });
    await send(id);
    expect(row(id).status).toBe('failed');
  });

  it('refuses a session already in delivery instead of sending it', async () => {
    const id = await created();
    row(id).status = 'queued';
    const response = await send(id);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'SEND_CONFLICT',
    });
    expect(mocks.sendTopicAnnouncement).not.toHaveBeenCalled();
    expect(row(id).status).toBe('queued');
  });

  it('says already sent, and claims a sent session only for a resend', async () => {
    const id = await created();
    row(id).status = 'sent';
    const again = await send(id);
    await expect(again.json()).resolves.toMatchObject({ code: 'ALREADY_SENT' });
    expect(mocks.sendTopicAnnouncement).not.toHaveBeenCalled();

    mocks.sendTopicAnnouncement.mockImplementation(sendsAndMarksSent(id));
    expect((await send(id, { resend: true })).status).toBe(200);
    expect(mocks.sendTopicAnnouncement).toHaveBeenCalledTimes(1);
  });

  it('claims schedule sessions in a bulk send too', async () => {
    const id = await created();
    row(id).status = 'processing';
    const response = await SEND_BULK(
      request({ announcementIds: [id] }),
      params
    );
    await expect(response.json()).resolves.toMatchObject({
      results: [{ announcementId: id, error: 'SEND_CONFLICT', status: 409 }],
    });
    expect(mocks.sendTopicAnnouncement).not.toHaveBeenCalled();
  });
});

describe('other announcements', () => {
  it('are sent exactly as before, without a claim', async () => {
    const id = await created();
    row(id).source_type = 'manual';
    let statusDuringSend: string | undefined;
    mocks.sendTopicAnnouncement.mockImplementation(async () => {
      statusDuringSend = row(id).status;
      return { error: 'NO_RECIPIENTS', status: 409 };
    });
    expect((await send(id)).status).toBe(409);
    expect(statusDuringSend).toBe('draft');
    expect(row(id).status).toBe('draft');

    row(id).status = 'queued';
    await send(id);
    expect(mocks.sendTopicAnnouncement).toHaveBeenCalledTimes(2);
  });
});
