// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  enabled: true,
  admin: false,
  approve_reports: false,
  view_payroll: false,
  tutor: false,
  gvcn: false,
  gvcnClass: 'class',
  view: true,
}));
vi.mock('next/server', () => ({ NextResponse: { json: Response.json } }));
vi.mock('@/lib/tutoring/tutor-comments', () => ({
  tutorCommentsEnabled: async () => state.enabled,
}));
vi.mock('@/lib/tutoring/route-access', () => ({
  resolveTutoringRouteAccess: async () => ({
    normalizedWsId: 'ws',
    user: { id: 'actor' },
    permissions: {
      withoutPermission: (p: string) =>
        p === 'view_user_groups'
          ? !state.view
          : !state[p as keyof typeof state],
    },
  }),
}));
const filters = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => {
    function from(table: string) {
      const predicates = new Map<string, unknown>();
      const q = {
        select: () => q,
        eq: (key: string, value: unknown) => {
          filters(key, value);
          predicates.set(key, value);
          return q;
        },
        maybeSingle: async () => ({
          error: null,
          data:
            table === 'workspace_tutoring_sessions'
              ? {
                  tutor_comment: 'Staff note',
                  group_id: 'class',
                  teacher_user_id: state.tutor ? 'virtual' : 'other',
                }
              : table === 'workspace_user_linked_users'
                ? { virtual_user_id: 'virtual' }
                : state.gvcn &&
                    predicates.get('group_id') === state.gvcnClass &&
                    predicates.get('user_id') === 'virtual' &&
                    predicates.get('role') === 'TEACHER'
                  ? { user_id: 'virtual' }
                  : null,
        }),
      };
      return q;
    }
    return { from, schema: () => ({ from }) };
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, {
    enabled: true,
    admin: false,
    approve_reports: false,
    view_payroll: false,
    tutor: false,
    gvcn: false,
    gvcnClass: 'class',
    view: true,
  });
});
async function read() {
  const { GET } = await import('./route');
  return GET(new Request('http://localhost'), {
    params: Promise.resolve({ wsId: 'ws', id: 'session' }),
  });
}
it.each(['admin', 'approve_reports', 'view_payroll', 'tutor', 'gvcn'] as const)(
  'allows %s',
  async (role) => {
    state[role] = true;
    const result = await read();
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({
      tutorComment: 'Staff note',
      canEdit: role === 'tutor',
    });
    expect(filters).toHaveBeenCalledWith('ws_id', 'ws');
    expect(filters).toHaveBeenCalledWith('id', 'session');
  }
);
it('rejects unrelated staff, learners and parents', async () => {
  expect((await read()).status).toBe(403);
});
it('requires view permission even for office staff', async () => {
  state.admin = true;
  state.view = false;
  expect((await read()).status).toBe(403);
});
it('flag OFF returns no comment and performs no session query', async () => {
  state.enabled = false;
  const result = await read();
  expect(result.status).toBe(404);
  expect(await result.json()).toEqual({});
  expect(filters).not.toHaveBeenCalled();
});

it('denies a GVCN belonging to another class', async () => {
  state.gvcn = true;
  state.gvcnClass = 'another-class';
  expect((await read()).status).toBe(403);
  expect(filters).toHaveBeenCalledWith('group_id', 'class');
  expect(filters).toHaveBeenCalledWith('user_id', 'virtual');
  expect(filters).toHaveBeenCalledWith('role', 'TEACHER');
});
