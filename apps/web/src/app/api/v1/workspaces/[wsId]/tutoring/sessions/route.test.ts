// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const wsId = '5d23287f-9094-4714-b8e0-dcce877464a0';
const groupId = '35d890d8-a79a-4648-b448-a206ac534d5c';
const studentId = '9a2f5b7e-3d10-4f64-8a5e-6c7d8e9f0a02';
const teacherId = '18a911d9-358c-4fe7-936f-ef6f17be1eb8';

type Result = { data: unknown; error: unknown; count?: number | null };

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  admin: vi.fn(),
  conflicts: vi.fn(),
  denyWeak: vi.fn(),
  linked: vi.fn(),
  resolveActor: vi.fn(),
  scope: vi.fn(),
  teachers: vi.fn(),
}));

const state = {
  filters: [] as [string, ...unknown[]][],
  groups: { data: [], error: null } as Result,
  inserted: null as unknown,
  sessions: { data: [], error: null, count: 0 } as Result,
  users: { data: [], error: null } as Result,
};

function builder(result: () => Result) {
  const b: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'gte', 'lte', 'in', 'order', 'range']) {
    b[method] = (...args: unknown[]) => {
      state.filters.push([method, ...args]);
      return b;
    };
  }
  b.insert = (rows: unknown) => {
    state.inserted = rows;
    return b;
  };
  // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are thenable.
  b.then = (
    resolve: (value: unknown) => unknown,
    reject: (error: unknown) => unknown
  ) => Promise.resolve(result()).then(resolve, reject);
  return b;
}

function fakeAdmin() {
  return {
    from: (table: string) =>
      builder(() =>
        table === 'workspace_user_groups' ? state.groups : state.users
      ),
    schema: () => ({ from: () => builder(() => state.sessions) }),
  };
}

vi.mock('next/server', () => ({
  connection: async () => {},
  NextResponse: { json: Response.json },
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.resolveActor,
}));
vi.mock('@/lib/tutoring/route-access', () => ({
  createTutoringRequestClient: async () => ({}),
  resolveTutoringRouteAccess: mocks.access,
}));
vi.mock('@/lib/tutoring/teachers', () => ({
  listWorkspaceTeacherIds: mocks.teachers,
}));
vi.mock('@/lib/tutoring/weak-content-access', () => ({
  denyWeakContentEdit: mocks.denyWeak,
  isWeakSupportSession: () => false,
}));
vi.mock('@/lib/tutoring/linked-content', () => ({
  isLinkedContentSession: (session: { reason_type?: string }) =>
    session.reason_type === 'ABSENT_RECOVERY',
  loadLinkedLessonContent: mocks.linked,
}));
vi.mock(
  '@/legacy-api-routes/v1/workspaces/[wsId]/tutoring/sessions/session-create-helpers',
  async (original) => ({
    ...(await original<object>()),
    listPotentialSchedulingConflicts: mocks.conflicts,
    validateTutoringSessionScope: mocks.scope,
  })
);

const params = { params: Promise.resolve({ wsId }) };

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    attendance_status: 'PENDING',
    content: 'own content',
    duration_minutes: 45,
    group_id: groupId,
    id: 'session-1',
    reason_type: 'CUSTOM',
    session_date: '2026-10-05',
    start_time: '17:30:00',
    student_user_id: studentId,
    teacher_user_id: teacherId,
    ...overrides,
  };
}

async function list(search = '') {
  const { GET } = await import('./route');
  const response = await GET(
    new Request(`http://localhost/tutoring/sessions${search}`),
    params
  );
  if (!response) throw new Error('Tutoring sessions returned no response');
  return response;
}

async function create(body: unknown, raw = false) {
  const { POST } = await import('./route');
  return POST(
    new Request('http://localhost/tutoring/sessions', {
      body: raw ? String(body) : JSON.stringify(body),
      method: 'POST',
    }),
    params
  );
}

const slotBody = (extra: Record<string, unknown> = {}) => ({
  groupId,
  reasonType: 'ABSENT_RECOVERY',
  sessionDate: '2026-10-05',
  startTime: '17:30',
  studentUserId: studentId,
  teacherUserId: teacherId,
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  state.filters = [];
  state.groups = { data: [], error: null };
  state.inserted = null;
  state.sessions = { data: [], error: null, count: 0 };
  state.users = { data: [], error: null };
  mocks.access.mockResolvedValue({
    normalizedWsId: wsId,
    permissions: { withoutPermission: () => false },
    user: { id: 'actor' },
  });
  mocks.admin.mockImplementation(async () => fakeAdmin());
  mocks.conflicts.mockResolvedValue({ data: [], error: null });
  mocks.denyWeak.mockResolvedValue(null);
  mocks.linked.mockResolvedValue(new Map());
  mocks.resolveActor.mockResolvedValue({ user: { id: 'session-actor' } });
  mocks.scope.mockResolvedValue(null);
  mocks.teachers.mockResolvedValue({
    error: null,
    teacherIds: new Set([teacherId]),
  });
});

describe('GET /tutoring/sessions', () => {
  it('answers 404 without access and 403 without view permission', async () => {
    mocks.access.mockResolvedValueOnce({
      normalizedWsId: wsId,
      permissions: null,
    });
    expect((await list()).status).toBe(404);

    mocks.access.mockResolvedValueOnce({
      normalizedWsId: wsId,
      permissions: { withoutPermission: () => true },
    });
    expect((await list()).status).toBe(403);
  });

  it('rejects an invalid query', async () => {
    const response = await list('?pageSize=500&sortOrder=sideways');

    expect(response.status).toBe(400);
    expect((await response.json()).issues.length).toBeGreaterThan(0);
  });

  it('joins groups and people, paging with the exact count', async () => {
    state.sessions = {
      count: 41,
      data: [
        sessionRow(),
        sessionRow({ group_id: null, id: 'session-2', teacher_user_id: null }),
      ],
      error: null,
    };
    state.groups = { data: [{ id: groupId, name: 'Class A' }], error: null };
    state.users = {
      data: [
        {
          display_name: null,
          email: null,
          full_name: 'Learner',
          id: studentId,
        },
        {
          display_name: null,
          email: null,
          full_name: 'Teacher',
          id: teacherId,
        },
      ],
      error: null,
    };

    const response = await list('?page=2&pageSize=20');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      count: 41,
      page: 2,
      pageSize: 20,
      totalPages: 3,
    });
    expect(body.data[0]).toMatchObject({
      content_linked: false,
      group: { name: 'Class A' },
      student: { full_name: 'Learner' },
      teacher: { full_name: 'Teacher' },
    });
    expect(body.data[1]).toMatchObject({ group: null, teacher: null });
    expect(state.filters).toContainEqual(['range', 20, 39]);
  });

  it('applies every filter and the requested sort direction', async () => {
    await list(
      `?fromDate=2026-10-01&toDate=2026-10-31&teacherId=${teacherId}` +
        `&groupId=${groupId}&studentUserId=${studentId}` +
        '&reasonType=WEAK_SUPPORT&attendanceStatus=DONE&sortOrder=asc'
    );

    expect(state.filters).toEqual(
      expect.arrayContaining([
        ['eq', 'ws_id', wsId],
        ['gte', 'session_date', '2026-10-01'],
        ['lte', 'session_date', '2026-10-31'],
        ['eq', 'teacher_user_id', teacherId],
        ['eq', 'group_id', groupId],
        ['eq', 'student_user_id', studentId],
        ['eq', 'reason_type', 'WEAK_SUPPORT'],
        ['eq', 'attendance_status', 'DONE'],
        ['order', 'session_date', { ascending: true }],
        ['order', 'start_time', { ascending: true }],
      ])
    );
  });

  it('lists newest first by default and reports one empty page', async () => {
    const body = await (await list()).json();

    expect(body).toMatchObject({ count: 0, data: [], totalPages: 1 });
    expect(state.filters).toContainEqual([
      'order',
      'session_date',
      { ascending: false },
    ]);
    // No rows means no group or user lookups.
    expect(state.filters.filter(([method]) => method === 'in')).toEqual([]);
  });

  it('shows linked make-up content over the stored text', async () => {
    state.sessions = {
      count: 1,
      data: [sessionRow({ reason_type: 'ABSENT_RECOVERY' })],
      error: null,
    };
    mocks.linked.mockResolvedValue(
      new Map([['session-1', 'Notes of the miss']])
    );

    const body = await (await list()).json();

    expect(body.data[0]).toMatchObject({
      content: 'Notes of the miss',
      content_linked: true,
    });
  });

  it('keeps the list when the linked content lookup fails', async () => {
    state.sessions = { count: 1, data: [sessionRow()], error: null };
    mocks.linked.mockRejectedValue(new Error('boom'));

    const response = await list();

    expect(response.status).toBe(200);
    expect((await response.json()).data[0].content).toBe('own content');
  });

  it('answers 500 when the session read or its relations fail', async () => {
    state.sessions = { count: null, data: null, error: new Error('db') };
    expect((await list()).status).toBe(500);

    state.sessions = { count: 1, data: [sessionRow()], error: null };
    state.groups = { data: null, error: new Error('db') };
    expect((await list()).status).toBe(500);
  });

  it('answers HEAD with the same status and no body', async () => {
    const { HEAD } = await import('./route');
    const response = await HEAD(
      new Request('http://localhost/tutoring/sessions'),
      params
    );

    expect(response?.status).toBe(200);
    expect(await response?.text()).toBe('');
  });
});

describe('POST /tutoring/sessions', () => {
  it('answers 404 without access and 403 without edit permission', async () => {
    mocks.access.mockResolvedValueOnce({
      normalizedWsId: wsId,
      permissions: null,
    });
    expect((await create(slotBody())).status).toBe(404);

    mocks.access.mockResolvedValueOnce({
      normalizedWsId: wsId,
      permissions: { withoutPermission: () => true },
    });
    expect((await create(slotBody())).status).toBe(403);
  });

  it('rejects malformed JSON and an invalid payload', async () => {
    expect((await create('{nope', true)).status).toBe(400);

    const invalid = await create(slotBody({ studentUserId: 'not-a-uuid' }));
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).message).toBe('Invalid request');
  });

  it('stops at the weak-content denial', async () => {
    mocks.denyWeak.mockResolvedValue(Response.json({}, { status: 403 }));

    expect((await create(slotBody())).status).toBe(403);
    expect(mocks.scope).not.toHaveBeenCalled();
  });

  it('answers 401 when no actor can be resolved', async () => {
    mocks.access.mockResolvedValue({
      normalizedWsId: wsId,
      permissions: { withoutPermission: () => false },
      user: null,
    });
    mocks.resolveActor.mockResolvedValue({ user: null });

    expect((await create(slotBody())).status).toBe(401);
  });

  it('falls back to the authenticated session actor when the request has none', async () => {
    mocks.access.mockResolvedValue({
      normalizedWsId: wsId,
      permissions: { withoutPermission: () => false },
      user: null,
    });
    state.sessions = { data: [{ id: 'new-1' }], error: null };

    expect((await create(slotBody())).status).toBe(200);
    expect(state.inserted).toMatchObject([{ created_by: 'session-actor' }]);
  });

  it('passes a scope failure straight through', async () => {
    mocks.scope.mockResolvedValue(
      Response.json({ message: 'Group not found' }, { status: 404 })
    );

    expect((await create(slotBody())).status).toBe(404);
  });

  it('needs sessions[] or a start date and time', async () => {
    const response = await create({
      groupId,
      reasonType: 'CUSTOM',
      studentUserId: studentId,
    });

    expect(response.status).toBe(400);
    expect((await response.json()).message).toContain('sessionDate/startTime');
  });

  it('validates every proposed teacher once', async () => {
    mocks.teachers.mockResolvedValue({ error: null, teacherIds: new Set() });

    const response = await create(slotBody());

    expect(response.status).toBe(400);
    expect(mocks.teachers).toHaveBeenCalledWith({
      normalizedWsId: wsId,
      sbAdmin: expect.anything(),
      teacherUserIds: [teacherId],
    });
  });

  it('answers 500 when the teacher check fails and skips it with no teacher', async () => {
    mocks.teachers.mockResolvedValue({
      error: new Error('db'),
      teacherIds: new Set(),
    });
    expect((await create(slotBody())).status).toBe(500);

    mocks.teachers.mockClear();
    state.sessions = { data: [{ id: 'new-1' }], error: null };
    expect((await create(slotBody({ teacherUserId: null }))).status).toBe(200);
    expect(mocks.teachers).not.toHaveBeenCalled();
  });

  it('refuses overlapping sessions for the same learner in one request', async () => {
    const response = await create(
      slotBody({
        sessions: [
          {
            durationMinutes: 60,
            sessionDate: '2026-10-05',
            startTime: '17:30',
          },
          {
            durationMinutes: 60,
            sessionDate: '2026-10-05',
            startTime: '18:00',
          },
        ],
      })
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe('SCHEDULING_CONFLICT');
    expect(
      body.conflicts.map((c: { conflictType: string }) => c.conflictType)
    ).toContain('student');
    expect(mocks.conflicts).not.toHaveBeenCalled();
  });

  it('refuses a slot that overlaps an existing session of the same teacher', async () => {
    mocks.conflicts.mockResolvedValue({
      data: [
        {
          duration_minutes: 45,
          group_id: groupId,
          session_date: '2026-10-05',
          start_time: '18:00:00',
          student_user_id: 'other-learner',
          teacher_user_id: teacherId,
        },
      ],
      error: null,
    });

    const response = await create(slotBody());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.message).toContain('existing sessions');
    expect(body.conflicts[0]).toMatchObject({ conflictType: 'teacher' });
    expect(state.inserted).toBeNull();
  });

  it('lets another learner join a teacher slot that already exists', async () => {
    mocks.conflicts.mockResolvedValue({
      data: [
        {
          duration_minutes: 45,
          group_id: 'other-group',
          session_date: '2026-10-05',
          start_time: '17:30:00',
          student_user_id: 'other-learner',
          teacher_user_id: teacherId,
        },
      ],
      error: null,
    });
    state.sessions = { data: [{ id: 'new-1' }], error: null };

    expect((await create(slotBody())).status).toBe(200);
  });

  it('answers 500 when the conflict lookup fails', async () => {
    mocks.conflicts.mockResolvedValue({ data: [], error: new Error('db') });

    expect((await create(slotBody())).status).toBe(500);
  });

  it('creates one row per slot and reports every id', async () => {
    state.sessions = { data: [{ id: 'new-1' }, { id: 'new-2' }], error: null };

    const response = await create(
      slotBody({
        content: 'Unit 4',
        durationMinutes: 60,
        sessionCount: 2,
      })
    );

    expect(await response.json()).toEqual({
      createdCount: 2,
      id: 'new-1',
      ids: ['new-1', 'new-2'],
    });
    expect(state.inserted).toMatchObject([
      {
        content: 'Unit 4',
        created_by: 'actor',
        duration_minutes: 60,
        start_time: '17:30',
        teacher_user_id: teacherId,
        ws_id: wsId,
      },
      { duration_minutes: 60, start_time: '18:30' },
    ]);
  });

  it('answers 500 when the insert fails and reports no id for an empty result', async () => {
    state.sessions = { data: null, error: new Error('db') };
    expect((await create(slotBody())).status).toBe(500);

    state.sessions = { data: null, error: null };
    expect(await (await create(slotBody())).json()).toEqual({
      createdCount: 0,
      id: null,
      ids: [],
    });
  });
});
