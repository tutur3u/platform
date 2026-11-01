import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createScheduleFixture,
  GVNN,
  GVNN_2,
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
function enforceSlotIndex(
  racing?: Row,
  { constraint = SLOT_INDEX }: { constraint?: string } = {}
) {
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
          message: `duplicate key value violates unique constraint "${constraint}"`,
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

/**
 * Enforces the slot index on UPDATE too: an edit that moves a session into a
 * taken slot is refused (23505). `racing` is inserted, as another request
 * would, right before this request's first session update.
 */
function enforceSlotIndexOnUpdate(
  racing: Row,
  { constraint = SLOT_INDEX }: { constraint?: string } = {}
) {
  const realFrom = mocks.admin.from.bind(mocks.admin);
  let raced = false;
  mocks.admin.from = (table: string) => {
    const chain = realFrom(table);
    if (table !== 'topic_announcements') return chain;
    const realUpdate = chain.update;
    const realEq = chain.eq;
    const realSelect = chain.select;
    let patch: Row | null = null;
    let targetId: unknown;
    chain.update = (value: Row) => {
      if (!raced && 'session_date' in value) {
        raced = true;
        mocks.admin.tables.topic_announcements.push({ ...racing });
      }
      patch = value;
      return realUpdate(value);
    };
    chain.eq = (key: string, value: unknown) => {
      if (key === 'id') targetId = value;
      return realEq(key, value);
    };
    chain.select = (...args: unknown[]) => {
      const existing = mocks.admin.tables.topic_announcements as Row[];
      const current = existing.find((row) => row.id === targetId);
      if (patch && current) {
        const next = { ...current, ...patch };
        const others = existing.filter((row) => row.id !== targetId);
        if (slotTaken(next, others)) {
          const failed = {
            data: null,
            error: {
              code: '23505',
              message: `duplicate key value violates unique constraint "${constraint}"`,
            },
          };
          const refused: Record<string, unknown> = {
            // biome-ignore lint/suspicious/noThenProperty: mimics the awaitable PostgREST builder.
            then: (
              resolve: (value: unknown) => unknown,
              reject: () => unknown
            ) => Promise.resolve(failed).then(resolve, reject),
          };
          return refused;
        }
      }
      return realSelect(...args);
    };
    return chain;
  };
}

const SLOT_INDEX = 'topic_announcements_schedule_slot_unique';

/**
 * Emulates private.set_topic_schedule_recipient (its locking and atomicity
 * are covered in supabase/tests/topic-schedule-slot-unique.sql). `before`
 * runs first, as a concurrent writer would just before the restore.
 */
function emulateRecipientRestore(before?: () => void) {
  mocks.admin.rpc.mockImplementation(async (name: string, args: Row) => {
    if (name !== 'set_topic_schedule_recipient') {
      return { data: null, error: null };
    }
    before?.();
    const row = (mocks.admin.tables.topic_announcements as Row[]).find(
      (item) =>
        item.id === args.p_announcement_id &&
        item.ws_id === args.p_ws_id &&
        item.source_type === 'schedule'
    );
    if (!row) return { data: 'not_found', error: null };
    if (
      row.sent_at ||
      !['draft', 'failed', 'skipped'].includes(String(row.status))
    ) {
      return { data: 'locked', error: null };
    }
    if (args.p_contact_id) {
      const contact = (
        mocks.admin.tables.topic_announcement_contacts as Row[]
      ).find((item) => item.id === args.p_contact_id);
      if (!contact || contact.archived || contact.ws_id !== args.p_ws_id) {
        return { data: 'contact_unavailable', error: null };
      }
    }
    mocks.admin.tables.topic_announcement_recipients = (
      mocks.admin.tables.topic_announcement_recipients as Row[]
    ).filter((item) => item.announcement_id !== args.p_announcement_id);
    if (args.p_contact_id) {
      mocks.admin.tables.topic_announcement_recipients.push({
        announcement_id: args.p_announcement_id,
        contact_id: args.p_contact_id,
      });
    }
    return { data: 'set', error: null };
  });
}

const recipientsOf = (id: string) =>
  (mocks.admin.tables.topic_announcement_recipients as Row[])
    .filter((row) => row.announcement_id === id)
    .map((row) => row.contact_id);

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

  it('refuses an edit into a slot another request just took and keeps saving', async () => {
    const { data } = await (await save([session()])).json();
    const id = data.createdIds[0];
    emulateRecipientRestore();
    enforceSlotIndexOnUpdate(
      racingSession({
        id: '00000000-0000-4000-8000-0000000000cc',
        session_date: '2026-10-20',
      })
    );
    const response = await save([
      // Move to 10-20 (now taken) and swap the GVNN.
      session({ gvnnContactId: GVNN_2, id, sessionDate: '2026-10-20' }),
      // A later new session in the same save.
      session({ groupId: K2, sessionDate: '2026-10-14', startTime: '18:00' }),
    ]);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.rowErrors).toEqual([
      { code: 'duplicate_slot', index: 0, sessionId: id },
    ]);
    expect(body.saved.createdIds).toHaveLength(1);
    const edited = sessions().find((row: Row) => row.id === id);
    expect(edited).toMatchObject({ session_date: '2026-10-13' });
    // The GVNN change did not apply either.
    expect(
      mocks.admin.tables.topic_announcement_recipients
        .filter((row: Row) => row.announcement_id === id)
        .map((row: Row) => row.contact_id)
    ).toEqual([GVNN]);
  });

  async function moveIntoTakenSlot(before?: () => void) {
    const { data } = await (await save([session()])).json();
    const id = data.createdIds[0] as string;
    emulateRecipientRestore(before);
    enforceSlotIndexOnUpdate(
      racingSession({
        id: '00000000-0000-4000-8000-0000000000dd',
        session_date: '2026-10-20',
      })
    );
    const response = await save([
      session({ gvnnContactId: GVNN_2, id, sessionDate: '2026-10-20' }),
      session({ groupId: K2, sessionDate: '2026-10-14', startTime: '18:00' }),
    ]);
    return { body: await response.json(), id, response };
  }

  it('never leaves no recipient when the previous GVNN was archived meanwhile', async () => {
    const { body, id, response } = await moveIntoTakenSlot(() => {
      (mocks.admin.tables.topic_announcement_contacts as Row[]).find(
        (contact) => contact.id === GVNN
      )!.archived = true;
    });
    expect(response.status).toBe(409);
    expect(body.rowErrors).toEqual([
      { code: 'partially_applied', fields: ['gvnn'], index: 0, sessionId: id },
    ]);
    // The new GVNN stays: never none. The other session still saved.
    expect(recipientsOf(id)).toEqual([GVNN_2]);
    expect(body.saved.createdIds).toHaveLength(1);
    expect(sessions().find((row: Row) => row.id === id)).toMatchObject({
      session_date: '2026-10-13',
    });
  });

  it('does not rewrite the recipient of a session a send claimed during the restore', async () => {
    let claimedId: string | undefined;
    const { body, id } = await moveIntoTakenSlot(() => {
      const row = sessions().find(
        (item: Row) => item.session_date === '2026-10-13'
      );
      row.status = 'processing';
      claimedId = row.id;
    });
    expect(claimedId).toBe(id);
    expect(body.rowErrors).toEqual([
      { code: 'partially_applied', fields: ['gvnn'], index: 0, sessionId: id },
    ]);
    // The send read GVNN_2; the restore did not touch it.
    expect(recipientsOf(id)).toEqual([GVNN_2]);
  });

  it('propagates a unique violation from any other constraint', async () => {
    enforceSlotIndex(racingSession(), {
      constraint: 'topic_announcements_pkey',
    });
    await expect(save([session()])).rejects.toMatchObject({ code: '23505' });

    mocks.admin = createScheduleFixture();
    const { data } = await (await save([session()])).json();
    enforceSlotIndexOnUpdate(
      racingSession({
        id: '00000000-0000-4000-8000-0000000000ee',
        session_date: '2026-10-20',
      }),
      { constraint: 'topic_announcements_pkey' }
    );
    await expect(
      save([session({ id: data.createdIds[0], sessionDate: '2026-10-20' })])
    ).rejects.toMatchObject({ code: '23505' });
  });
});
