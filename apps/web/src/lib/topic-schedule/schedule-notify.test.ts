import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createScheduleFixture,
  FOREIGN_SESSION,
  GVNN,
  K1,
  K2,
  K3,
  OTHER_WS,
  SUPERVISOR,
  T1,
  T2,
  T3,
  WS,
} from './schedule-fixture.test-helper';

const mocks = vi.hoisted(() => ({
  admin: null as any,
  teacherAssignments: true,
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
    withoutPermission: (permission: string) => permission !== 'manage_users',
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
const { POST: CLONE } = await import(
  '@/app/api/v1/workspaces/[wsId]/topic-announcements/schedule/clone/route'
);

const params = { params: Promise.resolve({ wsId: WS }) };
const P1 = '00000000-0000-4000-8000-0000000000f1';
const P3 = '00000000-0000-4000-8000-0000000000f3';

function request(body: unknown, method: string) {
  return new Request('http://localhost', {
    body: JSON.stringify(body),
    method,
  });
}

function save(
  sessions: unknown[],
  { deleteIds = [], month = '2026-10', notifyTeachers = true } = {}
) {
  return PUT(
    request({ deleteIds, month, notifyTeachers, sessions }, 'PUT'),
    params
  );
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

const notifications = () =>
  mocks.admin.rpc.mock.calls.filter(
    ([name]: [string]) => name === 'create_notification'
  );

beforeEach(() => {
  mocks.admin = createScheduleFixture();
  mocks.teacherAssignments = true;
  // T1 and T3 have accounts here; T2 is linked only in another workspace.
  mocks.admin.tables.workspace_user_linked_users = [
    { platform_user_id: P1, virtual_user_id: T1, ws_id: WS },
    { platform_user_id: P3, virtual_user_id: T3, ws_id: WS },
    {
      platform_user_id: '00000000-0000-4000-8000-0000000000f2',
      virtual_user_id: T2,
      ws_id: OTHER_WS,
    },
  ];
});

describe('save & notify teachers', () => {
  it('notifies the GVCN of a new session once', async () => {
    const response = await save([session()]);
    const { data } = await response.json();
    expect(data.notification).toMatchObject({
      failed: false,
      result: { notifiedTeachers: 1, skippedUnlinkedTeachers: 0 },
    });
    expect(notifications()).toHaveLength(1);
    expect(notifications()[0][1]).toMatchObject({
      p_data: { announcement_ids: data.createdIds },
      p_type: 'topic_assigned',
      p_user_id: P1,
      p_ws_id: WS,
    });
  });

  it('notifies the new teacher when a class change reassigns the session', async () => {
    const { data } = await (
      await save([session()], { notifyTeachers: false })
    ).json();
    expect(notifications()).toHaveLength(0);
    const id = data.createdIds[0];
    await save([session({ groupId: K2, id })]);
    expect(notifications()).toHaveLength(1);
    expect(notifications()[0][1]).toMatchObject({ p_user_id: P3 });
  });

  it('does not re-notify unchanged, retried or same-teacher saves', async () => {
    const { data } = await (await save([session()])).json();
    const id = data.createdIds[0];
    expect(notifications()).toHaveLength(1);

    const retry = await (await save([session()])).json();
    expect(retry.data).toMatchObject({ assignedIds: [], notification: null });
    await save([session({ id, room: 'P9' })]);
    await save([session({ id, room: 'P9' })]);
    expect(notifications()).toHaveLength(1);
  });

  it('sends nothing when the option is off', async () => {
    const { data } = await (
      await save([session()], { notifyTeachers: false })
    ).json();
    expect(data.notification).toBeNull();
    expect(notifications()).toHaveLength(0);
  });

  it('skips a teacher whose account is linked only in another workspace', async () => {
    mocks.admin.tables.workspace_user_linked_users[0].ws_id = OTHER_WS;
    const { data } = await (await save([session()])).json();
    expect(data.notification.result).toMatchObject({
      notifiedTeachers: 0,
      skippedUnlinkedTeachers: 1,
    });
    expect(notifications()).toHaveLength(0);
  });

  it('ignores sessions without a GVCN and another workspace session', async () => {
    const { data } = await (await save([session({ groupId: K3 })])).json();
    expect(data.notification.result).toMatchObject({
      notifiedTeachers: 0,
      unassignedAnnouncements: 1,
    });
    const foreign = await save([
      session({ id: FOREIGN_SESSION, sessionDate: '2026-10-20' }),
    ]);
    expect(foreign.status).toBe(400);
    expect(notifications()).toHaveLength(0);
  });

  it('has no effect with teacher assignments off', async () => {
    mocks.teacherAssignments = false;
    expect((await save([session()])).status).toBe(404);
    expect(notifications()).toHaveLength(0);
  });
});

describe('clone & notify teachers', () => {
  function clone(body: Record<string, unknown>) {
    return CLONE(
      request(
        { sourceMonth: '2026-10', targetMonth: '2026-11', ...body },
        'POST'
      ),
      params
    );
  }

  it('notifies each GVCN of the cloned sessions, never on a preview', async () => {
    await save(
      [session(), session({ groupId: K2, sessionDate: '2026-10-06' })],
      { notifyTeachers: false }
    );
    await clone({ dryRun: true, notifyTeachers: true });
    expect(notifications()).toHaveLength(0);

    const { data } = await (
      await clone({ dryRun: false, notifyTeachers: true })
    ).json();
    expect(data.notification.result.notifiedTeachers).toBe(2);
    expect(
      notifications()
        .map(([, args]: [string, { p_user_id: string }]) => args.p_user_id)
        .sort()
    ).toEqual([P1, P3].sort());

    await clone({ dryRun: false, notifyTeachers: true });
    expect(notifications()).toHaveLength(2);
  });
});
