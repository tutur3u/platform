// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const wsId = '5d23287f-9094-4714-b8e0-dcce877464a0';
const groupId = '35d890d8-a79a-4648-b448-a206ac534d5c';
const studentId = '9a2f5b7e-3d10-4f64-8a5e-6c7d8e9f0a02';
const ownId = '00000000-0000-4000-8000-000000000001';
const otherId = '00000000-0000-4000-8000-000000000002';

const state = vi.hoisted(() => ({
  linked: null as string | null,
  manager: false,
}));
const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  conflicts: vi.fn(),
  denyWeak: vi.fn(),
  insert: vi.fn(),
  scope: vi.fn(),
  teachers: vi.fn(),
}));

vi.mock('next/server', () => ({
  connection: async () => {},
  NextResponse: { json: Response.json },
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: async () => ({ user: { id: 'actor' } }),
}));
vi.mock('@/lib/tutoring/route-access', () => ({
  createTutoringRequestClient: async () => ({}),
  resolveTutoringRouteAccess: async () => ({
    normalizedWsId: wsId,
    user: { id: 'actor' },
    permissions: {
      wsId,
      withoutPermission: (permission: string) =>
        permission === 'view_payroll' && !state.manager,
    },
  }),
}));
vi.mock('@/lib/tutoring/teachers', () => ({
  listWorkspaceTeacherIds: mocks.teachers,
}));
vi.mock('@/lib/tutoring/weak-content-access', () => ({
  denyWeakContentEdit: mocks.denyWeak,
  isWeakSupportSession: () => false,
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

function install() {
  mocks.admin.mockResolvedValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: state.linked ? { virtual_user_id: state.linked } : null,
              error: null,
            }),
          }),
        }),
      }),
    }),
    schema: () => ({
      from: () => ({
        insert: (rows: unknown) => {
          mocks.insert(rows);
          return {
            select: async () => ({ data: [{ id: 'new-1' }], error: null }),
          };
        },
      }),
    }),
  });
}

async function create(extra: Record<string, unknown> = {}) {
  const { POST } = await import('./route');
  return POST(
    new Request('http://localhost/tutoring/sessions', {
      body: JSON.stringify({
        groupId,
        reasonType: 'CUSTOM',
        sessionDate: '2026-10-05',
        startTime: '17:30',
        studentUserId: studentId,
        ...extra,
      }),
      method: 'POST',
    }),
    params
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  state.linked = ownId;
  state.manager = false;
  install();
  mocks.conflicts.mockResolvedValue({ data: [], error: null });
  mocks.denyWeak.mockResolvedValue(null);
  mocks.scope.mockResolvedValue(null);
  mocks.teachers.mockResolvedValue({
    error: null,
    teacherIds: new Set([ownId, otherId]),
  });
});

describe('POST /tutoring/sessions write scope', () => {
  it('refuses a non-manager creating for another teacher before any write', async () => {
    const response = await create({ teacherUserId: otherId });

    expect(response.status).toBe(403);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.teachers).not.toHaveBeenCalled();
  });

  it('refuses another teacher on any slot of a bulk create', async () => {
    const response = await create({
      sessionDate: undefined,
      startTime: undefined,
      teacherUserId: ownId,
      sessions: [
        { sessionDate: '2026-10-05', startTime: '17:30' },
        {
          sessionDate: '2026-10-12',
          startTime: '17:30',
          teacherUserId: otherId,
        },
      ],
    });

    expect(response.status).toBe(403);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('cannot reach another teacher with a done (payable) status', async () => {
    const response = await create({
      attendanceStatus: 'DONE',
      teacherUserId: otherId,
    });

    expect(response.status).toBe(403);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('allows a non-manager creating for their own teacher id', async () => {
    const response = await create({ teacherUserId: ownId });

    expect(response.status).toBe(200);
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.insert.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ teacher_user_id: ownId }),
    ]);
  });

  it('assigns an omitted or null teacher to the actor, never to someone else', async () => {
    expect((await create()).status).toBe(200);
    expect((await create({ teacherUserId: null })).status).toBe(200);

    for (const [rows] of mocks.insert.mock.calls) {
      expect(rows).toEqual([
        expect.objectContaining({ teacher_user_id: ownId }),
      ]);
    }
  });

  it('allows a non-manager bulk create of only their own sessions', async () => {
    const response = await create({
      sessionDate: undefined,
      startTime: undefined,
      sessions: [
        { sessionDate: '2026-10-05', startTime: '17:30' },
        { sessionDate: '2026-10-12', startTime: '17:30', teacherUserId: ownId },
      ],
    });

    expect(response.status).toBe(200);
    const rows = (mocks.insert.mock.calls[0]?.[0] ?? []) as {
      teacher_user_id: string;
    }[];
    expect(rows.map((row) => row.teacher_user_id)).toEqual([ownId, ownId]);
  });

  it('refuses an unlinked non-manager', async () => {
    state.linked = null;

    expect((await create({ teacherUserId: ownId })).status).toBe(403);
    expect((await create()).status).toBe(403);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('lets a manager create for anyone, or leave the teacher unset', async () => {
    state.manager = true;
    state.linked = null;

    expect((await create({ teacherUserId: otherId })).status).toBe(200);
    expect((await create()).status).toBe(200);
    expect(
      mocks.insert.mock.calls.map(
        ([rows]) =>
          (rows as { teacher_user_id: string | null }[])[0]?.teacher_user_id
      )
    ).toEqual([otherId, null]);
  });
});
