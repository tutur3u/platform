import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ARCHIVED_CONTACT,
  ARCHIVED_GROUP,
  createScheduleFixture,
  GVNN,
  GVNN_2,
  K1,
  K2,
  K3,
  OTHER_WS,
  SUPERVISOR,
  T1,
  T2,
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
vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: vi.fn(async () => ({
    ok: true,
    user: { id: SUPERVISOR },
    supabase: mocks.admin,
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

function clone(body: Record<string, unknown> = {}) {
  return CLONE(
    request(
      {
        dryRun: false,
        sourceMonth: '2026-10',
        targetMonth: '2026-11',
        ...body,
      },
      'POST'
    ),
    params
  );
}

const row = (id: string) =>
  mocks.admin.tables.topic_announcements.find(
    (item: { id: string }) => item.id === id
  );

async function create(overrides: Record<string, unknown> = {}) {
  const { data } = await (await save([session(overrides)])).json();
  return data.createdIds[0] as string;
}

/** Flips a session to `status` just before the next write reaches it. */
function enterDeliveryBeforeWrite(id: string, status: string) {
  const realFrom = mocks.admin.from.bind(mocks.admin);
  mocks.admin.from = (table: string) => {
    const chain = realFrom(table);
    if (table === 'topic_announcements') {
      const realUpdate = chain.update;
      chain.update = (value: unknown) => {
        row(id).status = status;
        return realUpdate(value);
      };
    }
    return chain;
  };
}

beforeEach(() => {
  mocks.admin = createScheduleFixture();
  mocks.teacherAssignments = true;
});

describe('flag off', () => {
  it('exposes no schedule editor or month clone and writes nothing', async () => {
    mocks.teacherAssignments = false;
    const before = JSON.stringify(mocks.admin.tables);
    const listed = await GET(
      new Request('http://localhost/?month=2026-11'),
      params
    );
    expect(listed.status).toBe(404);
    expect((await save([session()])).status).toBe(404);
    expect((await clone()).status).toBe(404);
    expect(JSON.stringify(mocks.admin.tables)).toBe(before);
  });
});

describe('edit and delete locks', () => {
  it('refuses to edit a session already in delivery', async () => {
    const id = await create();
    row(id).status = 'queued';
    const response = await save([session({ id, room: 'P9' })]);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      rowErrors: [{ code: 'locked', index: 0, sessionId: id }],
    });
    expect(row(id).room).toBeNull();
  });

  it('reports a GVNN-only change when sending starts before the field write', async () => {
    const id = await create();
    enterDeliveryBeforeWrite(id, 'processing');
    const response = await save([
      session({ gvnnContactId: GVNN_2, id, room: 'P9' }),
    ]);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      rowErrors: [
        { code: 'partially_applied', fields: ['gvnn'], sessionId: id },
      ],
      saved: { updatedIds: [] },
    });
    // Fields untouched; the swapped GVNN is left as is, never restored.
    expect(row(id)).toMatchObject({ room: null, status: 'processing' });
    expect(mocks.admin.tables.topic_announcement_recipients).toMatchObject([
      { announcement_id: id, contact_id: GVNN_2 },
    ]);
  });

  it('changes nothing when only fields change and sending starts first', async () => {
    const id = await create();
    enterDeliveryBeforeWrite(id, 'processing');
    const response = await save([session({ id, room: 'P9' })]);
    await expect(response.json()).resolves.toMatchObject({
      rowErrors: [{ code: 'locked', sessionId: id }],
    });
    expect(row(id).room).toBeNull();
  });

  it('does not cancel a session queued mid-save', async () => {
    const id = await create();
    enterDeliveryBeforeWrite(id, 'queued');
    const response = await save([], [id]);
    expect(response.status).toBe(409);
    expect(row(id).status).toBe('queued');
  });

  it('treats removing an already removed session as done', async () => {
    const id = await create();
    expect((await save([], [id])).status).toBe(200);
    const retry = await save([], [id]);
    expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toMatchObject({
      data: { deletedIds: [id] },
    });
  });

  it('still refuses to remove another workspace session', async () => {
    const id = await create();
    row(id).ws_id = OTHER_WS;
    row(id).status = 'cancelled';
    const response = await save([], [id]);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      rowErrors: [{ code: 'not_found', sessionId: id }],
    });
  });
});

describe('slots, classes and teachers', () => {
  it('reports a different session in an existing slot as a conflict', async () => {
    await create();
    const response = await save([session({ gvnnContactId: GVNN_2 })]);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      rowErrors: [{ code: 'duplicate_slot', index: 0 }],
    });
  });

  it('refuses archived classes and archived GVNN', async () => {
    const listed = await GET(
      new Request('http://localhost/?month=2026-10'),
      params
    );
    const { data } = await listed.json();
    expect(data.classes.map((item: { id: string }) => item.id)).not.toContain(
      ARCHIVED_GROUP
    );
    expect(
      data.gvnnContacts.map((item: { id: string }) => item.id)
    ).not.toContain(ARCHIVED_CONTACT);

    const response = await save([
      session({ groupId: ARCHIVED_GROUP }),
      session({ gvnnContactId: ARCHIVED_CONTACT, startTime: '18:00' }),
    ]);
    const { rowErrors } = await response.json();
    expect(rowErrors.map((error: { code: string }) => error.code)).toEqual([
      'invalid_class',
      'invalid_contact',
    ]);
  });

  it('keeps the assigned teacher on an edit within the same class', async () => {
    const id = await create();
    row(id).teacher_workspace_user_id = T2;
    await save([session({ id, room: 'P9' })]);
    expect(row(id)).toMatchObject({
      room: 'P9',
      teacher_workspace_user_id: T2,
    });
  });
});

describe('month clone', () => {
  async function seedOctober() {
    await save([
      session(),
      session({
        groupId: K2,
        gvnnContactId: GVNN_2,
        sessionDate: '2026-10-06',
      }),
      session({ groupId: K3, gvnnContactId: null, sessionDate: '2026-10-20' }),
    ]);
  }

  const statuses = async (response: Response) =>
    (await response.json()).data.items.map(
      (item: { classLabel: string; status: string }) =>
        `${item.classLabel}:${item.status}`
    );

  it('drops a GVNN archived since the source month', async () => {
    await seedOctober();
    mocks.admin.tables.topic_announcement_contacts.find(
      (contact: { id: string }) => contact.id === GVNN
    ).archived = true;
    const { data } = await (await clone()).json();
    const k1 = data.items.find(
      (item: { classLabel: string }) => item.classLabel === 'K1'
    );
    expect(k1.gvnnContactId).toBeNull();
    const created = mocks.admin.tables.topic_announcement_recipients.filter(
      (recipient: { announcement_id: string }) =>
        data.createdIds.includes(recipient.announcement_id)
    );
    expect(
      created.map((item: { contact_id: string }) => item.contact_id)
    ).toEqual([GVNN_2]);
  });

  it('reports sessions of a removed class without placing them', async () => {
    await seedOctober();
    mocks.admin.tables.workspace_user_groups.find(
      (group: { id: string }) => group.id === K3
    ).archived = true;
    const { data } = await (await clone({ dryRun: true })).json();
    const k3 = data.items.find(
      (item: { classLabel: string }) => item.classLabel === 'K3'
    );
    expect(k3).toMatchObject({
      reason: 'class_removed',
      status: 'unplaced',
      targetDate: null,
    });
  });

  it('does not revive sessions removed from the target month', async () => {
    await seedOctober();
    const first = (await (await clone()).json()).data;
    expect(first.createdIds).toHaveLength(3);
    const k1 = first.createdIds.find((id: string) => row(id).group_id === K1);
    await save([], [k1], '2026-11');

    expect(await statuses(await clone({ dryRun: true }))).toEqual([
      'K2:exists',
      'K1:removed',
      'K3:exists',
    ]);
    const restored = await clone({ includeRemoved: true });
    expect(await statuses(restored)).toEqual([
      'K2:exists',
      'K1:create',
      'K3:exists',
    ]);
    expect(
      mocks.admin.tables.topic_announcements.filter(
        (item: { group_id: string; session_date: string; status: string }) =>
          item.group_id === K1 &&
          item.session_date === '2026-11-10' &&
          item.status === 'draft'
      )
    ).toHaveLength(1);
  });

  it('assigns the GVCN of the class at clone time', async () => {
    await seedOctober();
    const { data } = await (await clone()).json();
    const k1 = data.createdIds.find((id: string) => row(id).group_id === K1);
    expect(row(k1).teacher_workspace_user_id).toBe(T1);
  });
});
