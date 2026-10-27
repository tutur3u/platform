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

const { GET, PUT } = await import(
  '@/app/api/v1/workspaces/[wsId]/topic-announcements/schedule/route'
);

const params = { params: Promise.resolve({ wsId: WS }) };

function save(sessions: unknown[], deleteIds: string[] = []) {
  return PUT(
    new Request('http://localhost', {
      body: JSON.stringify({ deleteIds, month: '2026-10', sessions }),
      method: 'PUT',
    }),
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

const row = (id: string) =>
  mocks.admin.tables.topic_announcements.find(
    (item: { id: string }) => item.id === id
  );

/** Wraps `from(table)` so tests can hook a builder method. */
function hook(
  table: string,
  method: string,
  before: (...args: unknown[]) => void
) {
  const realFrom = mocks.admin.from.bind(mocks.admin);
  mocks.admin.from = (name: string) => {
    const chain = realFrom(name);
    if (name === table) {
      const real = chain[method];
      chain[method] = (...args: unknown[]) => {
        before(...args);
        return real(...args);
      };
    }
    return chain;
  };
}

beforeEach(() => {
  mocks.admin = createScheduleFixture();
  mocks.teacherAssignments = true;
});

describe('GVNN swap racing a send', () => {
  it('restores the previous GVNN when the session is queued mid-swap', async () => {
    const { data } = await (await save([session()])).json();
    const id = data.createdIds[0];
    // The session is queued right after its old recipient is removed.
    hook('topic_announcement_recipients', 'delete', () => {
      row(id).status = 'queued';
    });
    const response = await save([session({ gvnnContactId: GVNN_2, id })]);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      rowErrors: [{ code: 'locked', sessionId: id }],
      saved: { updatedIds: [] },
    });
    expect(mocks.admin.tables.topic_announcement_recipients).toMatchObject([
      { announcement_id: id, contact_id: GVNN },
    ]);
    expect(mocks.admin.tables.topic_announcement_recipients).toHaveLength(1);
  });

  it('also restores it when the session is sent mid-swap', async () => {
    const { data } = await (await save([session()])).json();
    const id = data.createdIds[0];
    hook('topic_announcement_recipients', 'insert', () => {
      row(id).sent_at = '2026-10-12T00:00:00.000Z';
    });
    const response = await save([session({ gvnnContactId: GVNN_2, id })]);
    expect(response.status).toBe(409);
    expect(
      mocks.admin.tables.topic_announcement_recipients.map(
        (item: { contact_id: string }) => item.contact_id
      )
    ).toEqual([GVNN]);
  });

  it('swaps the GVNN when nothing races it', async () => {
    const { data } = await (await save([session()])).json();
    const id = data.createdIds[0];
    expect((await save([session({ gvnnContactId: GVNN_2, id })])).status).toBe(
      200
    );
    expect(
      mocks.admin.tables.topic_announcement_recipients.map(
        (item: { contact_id: string }) => item.contact_id
      )
    ).toEqual([GVNN_2]);
  });
});

describe('month reads', () => {
  it('reads recipients in chunks of at most 100 sessions', async () => {
    for (let day = 0; day < 150; day += 1) {
      mocks.admin.tables.topic_announcements.push({
        group_id: K1,
        id: `00000000-0000-4000-8000-${String(day).padStart(12, '0')}`,
        session_date: `2026-10-${String((day % 28) + 1).padStart(2, '0')}`,
        source_type: 'schedule',
        start_time: `${String(8 + Math.floor(day / 28)).padStart(2, '0')}:00:00`,
        status: 'draft',
        ws_id: WS,
      });
    }
    const sizes: number[] = [];
    hook('topic_announcement_recipients', 'in', (_column, values) => {
      sizes.push((values as unknown[]).length);
    });
    const response = await GET(
      new Request('http://localhost/?month=2026-10'),
      params
    );
    expect(response.status).toBe(200);
    expect((await response.json()).data.sessions).toHaveLength(150);
    expect(sizes).toEqual([100, 50]);
  });
});
