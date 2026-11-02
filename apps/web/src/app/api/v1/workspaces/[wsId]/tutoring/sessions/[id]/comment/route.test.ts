// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  enabled: true,
  office: false,
  tutor: false,
  gvcn: false,
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
        p === 'view_user_groups' ? !state.view : !state.office,
    },
  }),
}));
const filters = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => {
    function from(table: string) {
      const q = {
        select: () => q,
        eq: (key: string, value: unknown) => {
          filters(key, value);
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
                : state.gvcn
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
    office: false,
    tutor: false,
    gvcn: false,
    view: true,
  });
});
async function read() {
  const { GET } = await import('./route');
  return GET(new Request('http://localhost'), {
    params: Promise.resolve({ wsId: 'ws', id: 'session' }),
  });
}
it.each(['office', 'tutor', 'gvcn'] as const)('allows %s', async (role) => {
  state[role] = true;
  const result = await read();
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual({ tutorComment: 'Staff note' });
  expect(filters).toHaveBeenCalledWith('ws_id', 'ws');
});
it('rejects unrelated staff, learners and parents', async () => {
  expect((await read()).status).toBe(403);
});
it('requires view permission even for office staff', async () => {
  state.office = true;
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
