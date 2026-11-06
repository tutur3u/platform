// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  payroll: false,
  filters: [] as unknown[][],
}));
vi.mock('next/server', () => ({
  NextResponse: { json: Response.json },
  connection: async () => {},
}));
vi.mock('@/legacy-api-routes/head', () => ({
  createLegacyGetHandler: (f: unknown) => f,
  createLegacyHeadHandler: () => vi.fn(),
}));
vi.mock('@/lib/tutoring/route-access', () => ({
  resolveTutoringRouteAccess: async () => ({
    normalizedWsId: 'workspace',
    user: { id: 'actor' },
    permissions: {
      withoutPermission: (p: string) => p === 'view_payroll' && !state.payroll,
    },
  }),
}));
vi.mock('@/lib/tutoring/linked-content', () => ({
  loadLinkedLessonContent: async () => new Map(),
  isLinkedContentSession: () => false,
}));
const ownId = '00000000-0000-4000-8000-000000000001';
const otherId = '00000000-0000-4000-8000-000000000002';
const users = [ownId, otherId].map((id) => ({
  id,
  full_name: id,
  display_name: null,
  email: null,
  memberships: [],
}));
const sessions = users.map((user) => ({
  id: user.id,
  group_id: null,
  student_user_id: user.id,
  teacher_user_id: user.id,
  session_date: '2026-10-01',
  start_time: '09:00',
  duration_minutes: 45,
  attendance_status: 'DONE',
  reason_type: 'CUSTOM',
  content: '',
}));
function query(table: string) {
  const filters: [string, unknown][] = [];
  const result = () => {
    const rows =
      table === 'workspace_tutoring_sessions'
        ? sessions
        : table === 'workspace_users'
          ? users
          : [];
    const data = rows.filter((row) =>
      filters.every(([column, value]) =>
        column === 'id'
          ? row.id === value
          : column === 'teacher_user_id' && 'teacher_user_id' in row
            ? row.teacher_user_id === value
            : true
      )
    );
    return { data, count: data.length, error: null };
  };
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      state.filters.push([table, column, value]);
      filters.push([column, value]);
      return builder;
    },
    gte: () => builder,
    lte: () => builder,
    in: () => builder,
    order: () => builder,
    range: () => builder,
    like: () => builder,
    maybeSingle: async () => ({
      data: { virtual_user_id: ownId },
      error: null,
    }),
    // biome-ignore lint/suspicious/noThenProperty: PostgREST builders are thenable.
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve),
  };
  return builder;
}
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    from: query,
    schema: () => ({ from: query }),
  }),
}));
beforeEach(() => {
  state.payroll = false;
  state.filters = [];
});
const context = { params: Promise.resolve({ wsId: 'workspace' }) };
for (const endpoint of [
  'detailed',
  'payroll',
  'report',
  'sessions',
  'teachers',
]) {
  for (const payroll of [false, true]) {
    it(`${endpoint}: ${payroll ? 'view_payroll reads all' : 'view_user_groups reads self only'}`, async () => {
      state.payroll = payroll;
      const url = `http://localhost/${endpoint}?fromDate=2026-10-01&toDate=2026-10-31&mode=${endpoint}&tutorsOnly=false`;
      const response =
        endpoint === 'sessions'
          ? await (await import('./sessions/route')).GET(
              new Request(url),
              context
            )
          : endpoint === 'teachers'
            ? await (await import('./teachers/route')).GET(
                new Request(url),
                context
              )
            : await (await import('./export/route')).GET(
                new Request(url),
                context
              );
      expect(response?.status).toBe(200);
      const body = await response!.json();
      expect(body.data).toHaveLength(payroll ? 2 : 1);
      if (!payroll) {
        expect(JSON.stringify(body)).not.toContain(otherId);
        expect(state.filters).toContainEqual(
          endpoint === 'teachers'
            ? ['workspace_users', 'id', ownId]
            : ['workspace_tutoring_sessions', 'teacher_user_id', ownId]
        );
      }
    });
  }
}

it('denies an explicit other teacher in the session list', async () => {
  const { GET } = await import('./sessions/route');
  const response = await GET(
    new Request(`http://localhost/sessions?teacherId=${otherId}`),
    context
  );
  expect(response?.status).toBe(403);
});
