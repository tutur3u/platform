// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const wsId = '5d23287f-9094-4714-b8e0-dcce877464a0';
const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  resolveAccess: vi.fn(),
}));

let sessionRows: Record<string, unknown>[] = [];

function query(rows: () => unknown[]) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    gte: () => builder,
    lte: () => builder,
    in: () => builder,
    order: () => builder,
    range: () => builder,
    // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are thenable.
    then(
      resolve: (value: unknown) => unknown,
      reject: (error: unknown) => unknown
    ) {
      return Promise.resolve({ data: rows(), error: null }).then(
        resolve,
        reject
      );
    },
  };
  return builder;
}

vi.mock('next/server', () => ({ NextResponse: { json: Response.json } }));
vi.mock('@/legacy-api-routes/head', () => ({
  createLegacyGetHandler: (handler: unknown) => handler,
  createLegacyHeadHandler: () => async () => new Response(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/lib/tutoring/route-access', () => ({
  resolveTutoringRouteAccess: mocks.resolveAccess,
}));

const session = (
  id: string,
  student: string,
  overrides: Record<string, unknown> = {}
) => ({
  id,
  group_id: `group-${id}`,
  student_user_id: student,
  teacher_user_id: 'teacher-1',
  session_date: '2026-11-02',
  start_time: '17:15:00',
  duration_minutes: 45,
  reason_type: 'CUSTOM',
  content: '',
  attendance_status: 'DONE',
  ...overrides,
});

beforeEach(() => {
  mocks.resolveAccess.mockResolvedValue({
    normalizedWsId: wsId,
    permissions: { withoutPermission: () => false },
  });
  mocks.createAdminClient.mockResolvedValue({
    from: (name: string) =>
      query(() =>
        name === 'workspace_users'
          ? ['1', '2'].map((n) => ({
              id: `teacher-${n}`,
              full_name:
                n === '1' ? 'Synthetic teacher' : 'Synthetic teacher 2',
              display_name: null,
              email: null,
            }))
          : []
      ),
    schema: () => ({ from: () => query(() => sessionRows) }),
  });
});

async function payroll() {
  const { GET } = await import('./route');
  const response = await GET(
    new Request('http://localhost/tutoring/export?mode=payroll'),
    { params: Promise.resolve({ wsId }) }
  );
  if (!response) throw new Error('Tutoring export returned no response');
  return (await response.json()).data;
}

describe('tutoring payroll for shared slots', () => {
  it('pays three learners in one slot as one 45-minute session', async () => {
    sessionRows = ['1', '2', '3'].map((n) => session(n, `learner-${n}`));
    expect(await payroll()).toEqual([
      {
        teacher_name: 'Synthetic teacher',
        completed_sessions: 1,
        total_minutes: 45,
        total_cong: 1,
      },
    ]);
  });

  it.each([45, 90])(
    'converts a %i-minute shared slot to cong',
    async (minutes) => {
      sessionRows = ['1', '2', '3'].map((n) =>
        session(n, `learner-${n}`, { duration_minutes: minutes })
      );
      expect(await payroll()).toMatchObject([
        { completed_sessions: 1, total_cong: minutes / 45 },
      ]);
    }
  );

  it('preserves a single learner and sums separate slots', async () => {
    sessionRows = [session('1', 'learner-1')];
    expect(await payroll()).toMatchObject([{ total_cong: 1 }]);
    sessionRows.push(session('2', 'learner-2', { start_time: '18:00:00' }));
    expect(await payroll()).toMatchObject([
      { completed_sessions: 2, total_cong: 2 },
    ]);
  });

  it('pays each distinct slot and only completed sessions', async () => {
    sessionRows = [
      session('1', 'learner-1'),
      session('2', 'learner-2', { start_time: '17:15:30' }),
      session('3', 'learner-3', { duration_minutes: 60 }),
      session('4', 'learner-4', { session_date: '2026-11-03' }),
      session('5', 'learner-5', {
        session_date: '2026-11-04',
        attendance_status: 'NO_SHOW',
      }),
    ];
    expect(await payroll()).toEqual([
      {
        teacher_name: 'Synthetic teacher',
        completed_sessions: 3,
        total_minutes: 45 + 60 + 45,
        total_cong: 150 / 45,
      },
    ]);
  });

  it('pays each teacher once when two teachers share a slot', async () => {
    sessionRows = [
      session('1', 'learner-1'),
      session('2', 'learner-2'),
      session('3', 'learner-3', { teacher_user_id: 'teacher-2' }),
      session('4', 'learner-4', { teacher_user_id: 'teacher-2' }),
    ];
    expect(await payroll()).toEqual([
      {
        teacher_name: 'Synthetic teacher',
        completed_sessions: 1,
        total_minutes: 45,
        total_cong: 1,
      },
      {
        teacher_name: 'Synthetic teacher 2',
        completed_sessions: 1,
        total_minutes: 45,
        total_cong: 1,
      },
    ]);
  });

  it('counts rows without a teacher one by one', async () => {
    sessionRows = [
      session('1', 'learner-1', { teacher_user_id: null }),
      session('2', 'learner-2', { teacher_user_id: null }),
    ];
    expect(await payroll()).toEqual([
      {
        teacher_name: 'N/A',
        completed_sessions: 2,
        total_minutes: 90,
        total_cong: 2,
      },
    ]);
  });
});
