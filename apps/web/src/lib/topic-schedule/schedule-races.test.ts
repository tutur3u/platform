import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createScheduleFixture,
  GVNN,
  GVNN_2,
  K1,
  K2,
  SUPERVISOR,
  T1,
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
  async function created(overrides: Record<string, unknown> = {}) {
    const { data } = await (await save([session(overrides)])).json();
    return data.createdIds[0] as string;
  }

  const recipientIds = () =>
    mocks.admin.tables.topic_announcement_recipients.map(
      (item: { contact_id: string }) => item.contact_id
    );

  it('changes nothing when the session is claimed before the swap', async () => {
    const id = await created();
    hook('topic_announcements', 'select', (columns) => {
      if (columns === 'status,sent_at') row(id).status = 'processing';
    });
    const response = await save([
      session({ gvnnContactId: GVNN_2, id, room: 'P9' }),
    ]);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      rowErrors: [{ code: 'locked', sessionId: id }],
    });
    expect(recipientIds()).toEqual([GVNN]);
    expect(row(id).room).toBeNull();
  });

  it('reports a GVNN-only change when claimed during the swap', async () => {
    const id = await created();
    hook('topic_announcement_recipients', 'delete', () => {
      row(id).status = 'processing';
    });
    // A class change too: it must not apply (or notify) on a partial save.
    const response = await save([
      session({ gvnnContactId: GVNN_2, groupId: K2, id, room: 'P9' }),
    ]);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      rowErrors: [{ code: 'partially_applied', fields: ['gvnn'] }],
    });
    expect(recipientIds()).toEqual([GVNN_2]);
    expect(row(id)).toMatchObject({
      group_id: K1,
      room: null,
      teacher_workspace_user_id: T1,
    });
  });

  it('saves everything when a racing send released its claim', async () => {
    const id = await created();
    // The send claimed, found no recipient mid-swap, and released the claim.
    hook('topic_announcement_recipients', 'delete', () => {
      row(id).status = 'processing';
    });
    hook('topic_announcement_recipients', 'insert', () => {
      row(id).status = 'draft';
    });
    const response = await save([
      session({ gvnnContactId: GVNN_2, id, room: 'P9' }),
    ]);
    expect(response.status).toBe(200);
    expect(recipientIds()).toEqual([GVNN_2]);
    expect(row(id).room).toBe('P9');
  });

  it('puts the previous GVNN back when the swap itself fails', async () => {
    const id = await created();
    let failed = false;
    hook('topic_announcement_recipients', 'insert', () => {
      if (failed) return;
      failed = true;
      throw new Error('insert failed');
    });
    await expect(
      save([session({ gvnnContactId: GVNN_2, id })])
    ).rejects.toThrow('insert failed');
    expect(recipientIds()).toEqual([GVNN]);
  });

  it('swaps the GVNN when nothing races it', async () => {
    const id = await created();
    expect((await save([session({ gvnnContactId: GVNN_2, id })])).status).toBe(
      200
    );
    expect(recipientIds()).toEqual([GVNN_2]);
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
