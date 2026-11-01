// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sessionId = 'f0747f37-bf6d-4263-a5df-a11c57bdc762';
const wsId = '5d23287f-9094-4714-b8e0-dcce877464a0';
const ownId = '00000000-0000-4000-8000-000000000001';
const otherId = '00000000-0000-4000-8000-000000000002';

const state = vi.hoisted(() => ({
  manager: false,
  sessionTeacher: '' as string | null,
}));
const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  notifyCompletionSafely: vi.fn(),
  freeze: vi.fn(),
  listTeachers: vi.fn(),
}));

vi.mock('next/server', () => ({
  NextResponse: { json: Response.json },
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
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
vi.mock('@/lib/tutoring/completion-notification', () => ({
  notifyCompletionSafely: mocks.notifyCompletionSafely,
}));
vi.mock('@/lib/tutoring/linked-content', () => ({
  freezeLinkedLessonContent: mocks.freeze,
  LINKED_CONTENT_NOT_STORED: 'LINKED_CONTENT_NOT_STORED',
}));
vi.mock('@/lib/tutoring/teachers', () => ({
  listWorkspaceTeacherIds: mocks.listTeachers,
}));

// Rows honour the `teacher_user_id` filter so a pinned write that no longer
// matches the actor's own session comes back empty, like PostgREST.
const writes = { update: vi.fn(), delete: vi.fn() };
function sessionsQuery() {
  const filters: [string, unknown][] = [];
  const row = () => ({
    id: sessionId,
    attendance_status: 'PENDING',
    reason_type: 'CUSTOM',
    source_feedback_id: null,
    group_id: 'group',
    session_date: '2026-10-01',
    start_time: '09:00',
    duration_minutes: 45,
    student_user_id: 'student',
    teacher_user_id: state.sessionTeacher,
  });
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      filters.push([column, value]);
      return builder;
    },
    in: () => builder,
    is: () => builder,
    neq: () => builder,
    update: (values: unknown) => {
      writes.update(values);
      return builder;
    },
    delete: () => {
      writes.delete();
      return builder;
    },
    maybeSingle: async () => {
      const teacherFilter = filters.find(([c]) => c === 'teacher_user_id');
      const matches =
        !teacherFilter || teacherFilter[1] === state.sessionTeacher;
      return { data: matches ? row() : null, error: null };
    },
    // biome-ignore lint/suspicious/noThenProperty: PostgREST builders are thenable.
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve),
  };
  return builder;
}

function install() {
  mocks.createAdminClient.mockResolvedValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { virtual_user_id: ownId },
              error: null,
            }),
          }),
        }),
      }),
    }),
    schema: () => ({ from: sessionsQuery }),
  });
  return writes;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.manager = false;
  state.sessionTeacher = otherId;
  mocks.notifyCompletionSafely.mockResolvedValue(undefined);
  mocks.freeze.mockResolvedValue('stored');
  mocks.listTeachers.mockResolvedValue({
    error: null,
    teacherIds: new Set([ownId, otherId]),
  });
});

async function mark() {
  const { POST } = await import('./route');
  return POST(
    new Request('http://localhost/mark', {
      method: 'POST',
      body: JSON.stringify({ attendanceStatus: 'DONE' }),
    }),
    { params: Promise.resolve({ id: sessionId, wsId }) }
  );
}

describe('mark tutoring session write scope', () => {
  it("denies marking another teacher's session without writing", async () => {
    const writes = install();
    const response = await mark();
    expect(response.status).toBe(404);
    expect(writes.update).not.toHaveBeenCalled();
    expect(mocks.notifyCompletionSafely).not.toHaveBeenCalled();
  });

  it('lets a teacher mark their own session', async () => {
    state.sessionTeacher = ownId;
    const writes = install();
    expect((await mark()).status).toBe(200);
    expect(writes.update).toHaveBeenCalledWith(
      expect.objectContaining({ attendance_status: 'DONE' })
    );
  });

  it("lets a manager mark any teacher's session", async () => {
    state.manager = true;
    const writes = install();
    expect((await mark()).status).toBe(200);
    expect(writes.update).toHaveBeenCalledTimes(1);
  });
});
