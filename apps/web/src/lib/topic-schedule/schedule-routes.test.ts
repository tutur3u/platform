import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createScheduleFixture,
  FOREIGN_CONTACT,
  FOREIGN_GROUP,
  FOREIGN_SESSION,
  GVNN,
  GVNN_2,
  K1,
  K2,
  K3,
  SUPERVISOR,
  T1,
  T2,
  T3,
  WS,
} from './schedule-fixture.test-helper';

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
    user: { id: SUPERVISOR },
  })),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: vi.fn(async () => ({
    withoutPermission: (permission: string) => !mocks.granted.has(permission),
  })),
  getSecret: vi.fn((name: string, rows: { name: string; value: string }[]) =>
    rows.find((row) => row.name === name)
  ),
  getSecrets: vi.fn(async () => [
    { name: 'ENABLE_TOPIC_ANNOUNCEMENTS', value: 'true' },
    { name: 'ENABLE_TOPIC_TEACHER_ASSIGNMENTS', value: 'true' },
  ]),
  normalizeWorkspaceId: vi.fn(async (wsId: string) => wsId),
}));
vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  downloadWorkspaceStorageObjectForProvider: vi.fn(),
  getWorkspaceStorageObjectMetadataForProvider: vi.fn(),
  WorkspaceStorageError: class extends Error {},
}));

const { GET, PUT } = await import(
  '@/app/api/v1/workspaces/[wsId]/topic-announcements/schedule/route'
);
const { POST: CLONE } = await import(
  '@/app/api/v1/workspaces/[wsId]/topic-announcements/schedule/clone/route'
);

const params = { params: Promise.resolve({ wsId: WS }) };

function request(body: unknown, method: string) {
  return new Request('http://localhost', {
    body: JSON.stringify(body),
    method,
  });
}

function save(
  sessions: unknown[],
  deleteIds: string[] = [],
  month = '2026-10'
) {
  return PUT(request({ deleteIds, month, sessions }, 'PUT'), params);
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

async function month(value: string) {
  const response = await GET(
    new Request(`http://localhost/?month=${value}`),
    params
  );
  expect(response.status).toBe(200);
  return (await response.json()).data;
}

const rows = () =>
  mocks.admin.tables.topic_announcements.filter(
    (row: { ws_id: string }) => row.ws_id === WS
  );

beforeEach(() => {
  mocks.admin = createScheduleFixture();
  mocks.granted = new Set(['manage_users']);
});

describe('schedule editor save', () => {
  it('auto-assigns the GVCN and defaults to a 30 minute period', async () => {
    const response = await save([
      session(),
      session({ groupId: K2, gvnnContactId: null }),
      session({ groupId: K3, startTime: '18:00' }),
    ]);
    expect(response.status).toBe(200);

    const { sessions } = await month('2026-10');
    expect(sessions).toHaveLength(3);
    const byClass = Object.fromEntries(
      sessions.map((item: any) => [item.groupId, item])
    );
    expect(byClass[K1]).toMatchObject({
      durationMinutes: 30,
      endTime: '18:00',
      gvnnContactId: GVNN,
      teacherWorkspaceUserId: T1,
    });
    // Two teachers: the earliest assigned. No GVNN yet: saved, needs one.
    expect(byClass[K2]).toMatchObject({
      gvnnContactId: null,
      teacherWorkspaceUserId: T3,
    });
    // No TEACHER member (only a student): saved without a GVCN.
    expect(byClass[K3].teacherWorkspaceUserId).toBeNull();
    expect(rows()[0]).toMatchObject({
      send_due_at: '2026-10-12T10:30:00.000Z',
      source_type: 'schedule',
      status: 'draft',
      topic: null,
    });
  });

  it('never takes the GVCN from the client', async () => {
    await save([{ ...session(), teacherWorkspaceUserId: T2 }]);
    expect(rows()[0].teacher_workspace_user_id).toBe(T1);
  });

  it('is safe to retry: a repeated save creates nothing new', async () => {
    const first = await (await save([session()])).json();
    const retry = await (await save([session()])).json();
    expect(first.data.createdIds).toHaveLength(1);
    expect(retry.data).toMatchObject({
      createdIds: [],
      existingIds: first.data.createdIds,
    });
    expect(rows()).toHaveLength(1);
    expect(mocks.admin.tables.topic_announcement_recipients).toHaveLength(1);
  });

  it('rejects duplicate slots in one save and writes nothing', async () => {
    const response = await save([session(), session({ gvnnContactId: null })]);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      rowErrors: [{ code: 'duplicate_slot', index: 1 }],
    });
    expect(rows()).toHaveLength(0);
  });

  it('edits and removes individual sessions', async () => {
    const created = (await (await save([session()])).json()).data.createdIds;
    const id = created[0];

    await save([session({ durationMinutes: 45, gvnnContactId: GVNN_2, id })]);
    let [edited] = (await month('2026-10')).sessions;
    expect(edited).toMatchObject({ endTime: '18:15', gvnnContactId: GVNN_2 });
    expect(mocks.admin.tables.topic_announcement_recipients).toMatchObject([
      { announcement_id: id, contact_id: GVNN_2 },
    ]);
    expect(mocks.admin.tables.topic_announcement_recipients).toHaveLength(1);

    // Moving to another class re-assigns that class's GVCN.
    await save([session({ groupId: K2, id })]);
    [edited] = (await month('2026-10')).sessions;
    expect(edited.teacherWorkspaceUserId).toBe(T3);

    await save([], [id]);
    expect((await month('2026-10')).sessions).toHaveLength(0);
    expect(rows()[0].status).toBe('cancelled');
  });

  it('locks sessions already handed to delivery', async () => {
    const [id] = (await (await save([session()])).json()).data.createdIds;
    rows()[0].status = 'sent';
    const response = await save([], [id]);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      rowErrors: [{ code: 'locked', sessionId: id }],
    });
    expect(rows()[0].status).toBe('sent');
  });

  it('rejects dates outside the edited month', async () => {
    const response = await save([session({ sessionDate: '2026-11-03' })]);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      rowErrors: [{ code: 'outside_month' }],
    });
  });
});

describe('cross-workspace denial', () => {
  it('refuses another workspace class, contact or session', async () => {
    const response = await save([
      session({ groupId: FOREIGN_GROUP }),
      session({ gvnnContactId: FOREIGN_CONTACT, startTime: '18:00' }),
      session({ id: FOREIGN_SESSION, sessionDate: '2026-10-20' }),
    ]);
    expect(response.status).toBe(400);
    const { rowErrors } = await response.json();
    expect(rowErrors.map((error: { code: string }) => error.code)).toEqual([
      'invalid_class',
      'invalid_contact',
      'not_found',
    ]);

    const removal = await save([], [FOREIGN_SESSION], '2026-11');
    expect(removal.status).toBe(400);
    const foreign = mocks.admin.tables.topic_announcements.find(
      (row: { id: string }) => row.id === FOREIGN_SESSION
    );
    expect(foreign.status).toBe('draft');
    expect(rows()).toHaveLength(0);
  });

  it('lists only this workspace and its GVNN-tagged contacts', async () => {
    const data = await month('2026-11');
    expect(data.sessions).toEqual([]);
    expect(data.classes.map((item: { id: string }) => item.id)).toEqual([
      K1,
      K2,
      K3,
    ]);
    expect(data.gvnnContacts.map((item: { id: string }) => item.id)).toEqual([
      GVNN,
      GVNN_2,
    ]);
  });

  it('is supervisor scope only', async () => {
    mocks.granted = new Set(['update_user_groups_posts']);
    expect((await save([session()])).status).toBe(403);
    expect(rows()).toHaveLength(0);
  });
});

describe('month clone', () => {
  async function seedOctober() {
    await save([
      session(), // 2nd Tuesday
      session({ groupId: K2, sessionDate: '2026-10-29' }), // 5th Thursday
      session({ groupId: K3, gvnnContactId: null, sessionDate: '2026-10-06' }),
    ]);
  }

  function clone(dryRun: boolean, targetMonth = '2026-11') {
    return CLONE(
      request({ dryRun, sourceMonth: '2026-10', targetMonth }, 'POST'),
      params
    );
  }

  it('previews without writing', async () => {
    await seedOctober();
    const before = rows().length;
    const { data } = await (await clone(true)).json();
    expect(rows()).toHaveLength(before);
    expect(
      data.items.map((item: any) => [
        item.sourceDate,
        item.targetDate,
        item.status,
      ])
    ).toEqual([
      ['2026-10-06', '2026-11-03', 'create'],
      ['2026-10-13', '2026-11-10', 'create'],
      ['2026-10-29', null, 'unplaced'],
    ]);
    expect(data.items[2].reason).toBe('no_such_weekday');
  });

  it('commits once: re-cloning creates no duplicates', async () => {
    await seedOctober();
    const first = (await (await clone(false)).json()).data;
    expect(first.createdIds).toHaveLength(2);
    const second = (await (await clone(false)).json()).data;
    expect(second.createdIds).toEqual([]);
    expect(second.items.map((item: { status: string }) => item.status)).toEqual(
      ['exists', 'exists', 'unplaced']
    );

    const november = (await month('2026-11')).sessions;
    expect(november).toHaveLength(2);
    expect(
      november.find((item: { groupId: string }) => item.groupId === K1)
    ).toMatchObject({
      endTime: '18:00',
      gvnnContactId: GVNN,
      sessionDate: '2026-11-10',
      teacherWorkspaceUserId: T1,
    });
  });

  it('does not clone cancelled sessions and skips slots already present', async () => {
    await seedOctober();
    const k3 = (await month('2026-10')).sessions.find(
      (item: { groupId: string }) => item.groupId === K3
    );
    await save([], [k3.id]);
    await save([session({ sessionDate: '2026-11-10' })], [], '2026-11');
    const { data } = await (await clone(false)).json();
    expect(data.items.map((item: any) => item.status)).toEqual([
      'exists',
      'unplaced',
    ]);
    expect(data.createdIds).toEqual([]);
  });

  it('rejects cloning a month onto itself', async () => {
    const response = await clone(false, '2026-10');
    expect(response.status).toBe(400);
  });
});
