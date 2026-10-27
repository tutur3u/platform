import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createScheduleFixture,
  GVNN,
  K1,
  K2,
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

const { PUT } = await import(
  '@/app/api/v1/workspaces/[wsId]/topic-announcements/schedule/route'
);
const { POST: CLONE } = await import(
  '@/app/api/v1/workspaces/[wsId]/topic-announcements/schedule/clone/route'
);

const params = { params: Promise.resolve({ wsId: WS }) };

type Row = Record<string, unknown>;

function request(body: unknown, method: string) {
  return new Request('http://localhost', {
    body: JSON.stringify(body),
    method,
  });
}

function save(sessions: unknown[], month = '2026-10') {
  return PUT(request({ deleteIds: [], month, sessions }, 'PUT'), params);
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

const sessions = () =>
  mocks.admin.tables.topic_announcements.filter(
    (row: Row) => row.ws_id === WS && row.source_type === 'schedule'
  );

const slotTaken = (row: Row, others: Row[]) =>
  others.some(
    (other) =>
      other !== row &&
      other.source_type === 'schedule' &&
      other.status !== 'cancelled' &&
      other.ws_id === row.ws_id &&
      other.group_id === row.group_id &&
      other.session_date === row.session_date &&
      other.start_time === row.start_time
  );

/**
 * Makes the fake enforce topic_announcements_schedule_slot_unique, and lets
 * a "concurrent request" take a slot right before this request inserts.
 */
function enforceSlotIndex(racing?: Row) {
  const realFrom = mocks.admin.from.bind(mocks.admin);
  let raced = false;
  mocks.admin.from = (table: string) => {
    const chain = realFrom(table);
    if (table === 'topic_announcement_batches' && racing && !raced) {
      raced = true;
      mocks.admin.tables.topic_announcements.push({ ...racing });
    }
    if (table !== 'topic_announcements') return chain;
    const realInsert = chain.insert;
    chain.insert = (value: Row | Row[]) => {
      const rows = Array.isArray(value) ? value : [value];
      const existing = mocks.admin.tables.topic_announcements as Row[];
      const conflict = rows.some(
        (row) => slotTaken(row, existing) || slotTaken(row, rows)
      );
      if (!conflict) return realInsert(value);
      const failed = {
        data: null,
        error: {
          code: '23505',
          message:
            'duplicate key value violates unique constraint "topic_announcements_schedule_slot_unique"',
        },
      };
      const refused: Record<string, unknown> = {
        select: () => refused,
        single: async () => failed,
        // biome-ignore lint/suspicious/noThenProperty: mimics the awaitable PostgREST builder.
        then: (resolve: (value: unknown) => unknown, reject: () => unknown) =>
          Promise.resolve(failed).then(resolve, reject),
      };
      return refused;
    };
    return chain;
  };
}

const racingSession = (overrides: Row = {}): Row => ({
  group_id: K1,
  id: '00000000-0000-4000-8000-0000000000aa',
  session_date: '2026-10-13',
  source_type: 'schedule',
  start_time: '17:30:00',
  status: 'draft',
  ws_id: WS,
  ...overrides,
});

beforeEach(() => {
  mocks.admin = createScheduleFixture();
  mocks.teacherAssignments = true;
});

describe('slot uniqueness index (concurrent requests)', () => {
  it('saves the other sessions and reports the slot another request took', async () => {
    enforceSlotIndex(racingSession());
    const response = await save([
      session(),
      session({ groupId: K2, startTime: '18:00' }),
    ]);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.rowErrors).toEqual([
      { code: 'duplicate_slot', index: 0, sessionId: null },
    ]);
    expect(body.saved.createdIds).toHaveLength(1);
    // The racing session plus this request's K2 session; no duplicate K1 row.
    expect(
      sessions()
        .map(
          (row: Row) => `${row.group_id === K1 ? 'K1' : 'K2'} ${row.start_time}`
        )
        .sort()
    ).toEqual(['K1 17:30:00', 'K2 18:00:00']);
    // Only the saved session got a GVNN recipient.
    expect(mocks.admin.tables.topic_announcement_recipients).toHaveLength(1);
  });

  it('saves normally when no request races', async () => {
    enforceSlotIndex();
    expect((await save([session()])).status).toBe(200);
    expect(sessions()).toHaveLength(1);
  });

  it('marks a cloned session already scheduled when another request took its slot', async () => {
    await save([
      session(),
      session({ groupId: K2, sessionDate: '2026-10-06' }),
    ]);
    // A concurrent request puts K1 into its November slot (2nd Tuesday).
    enforceSlotIndex(
      racingSession({
        id: '00000000-0000-4000-8000-0000000000bb',
        session_date: '2026-11-10',
      })
    );
    const response = await CLONE(
      request(
        { dryRun: false, sourceMonth: '2026-10', targetMonth: '2026-11' },
        'POST'
      ),
      params
    );
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.createdIds).toHaveLength(1);
    expect(
      data.items.map(
        (item: { classLabel: string; status: string }) =>
          `${item.classLabel}:${item.status}`
      )
    ).toEqual(['K2:create', 'K1:exists']);
    expect(
      sessions().filter((row: Row) => row.session_date === '2026-11-10')
    ).toHaveLength(1);
  });
});
