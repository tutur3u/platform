import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  own: false,
  permissions: ['ai_lab', 'view_user_groups'],
  from: vi.fn(),
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (
      handler: (
        request: NextRequest,
        context: unknown,
        params: unknown
      ) => unknown
    ) =>
    (request: NextRequest, route: { params: unknown }) =>
      handler(request, { user: { id: 'actor' }, supabase: {} }, route.params),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ from: state.from }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: async (wsId: string) => wsId,
  verifyWorkspaceMembershipType: async () => ({
    ok: true,
    membershipType: 'MEMBER',
  }),
  getPermissions: async () => ({
    withoutPermission: (permission: string) =>
      !state.permissions.includes(permission),
  }),
}));

import { GET as sets } from '../app/api/v1/workspaces/[wsId]/course-modules/[moduleId]/quiz-sets/route';
import { GET as linked } from '../app/api/v1/workspaces/[wsId]/quiz-sets/[setId]/linked-modules/route';
import { GET as quizzes } from '../app/api/v1/workspaces/[wsId]/quiz-sets/[setId]/quizzes/route';

beforeEach(() => {
  state.own = false;
  state.permissions = ['ai_lab', 'view_user_groups'];
  state.from.mockReset().mockImplementation((_table: string) => {
    const filters: Record<string, string> = {};
    let ids: string[] = [];
    const query = {
      in: (_key: string, values: string[]) => {
        ids = values;
        return query;
      },
      select: () => query,
      eq: (key: string, value: string) => {
        filters[key] = value;
        return query;
      },
      order: () => query,
      range: () => query,
      ilike: () => query,
      maybeSingle: async () => ({
        data:
          _table === 'workspace_secrets'
            ? { value: 'true' }
            : state.own &&
                (filters.ws_id === 'workspace-a' ||
                  filters['workspace_user_groups.ws_id'] === 'workspace-a')
              ? { id: 'resource' }
              : null,
        error: null,
      }),
      then: (resolve: (value: unknown) => void) =>
        resolve({
          data:
            _table === 'workspace_course_modules' ||
            _table === 'workspace_user_groups'
              ? state.own
                ? ids.map((id) => ({ id, group_id: 'group' }))
                : []
              : [{ id: 'private-content' }],
          count: 1,
          error: null,
        }),
    };
    return query;
  });
});
const id = '00000000-0000-4000-8000-000000000001';
for (const [name, handler, params] of [
  ['quizzes', quizzes, { wsId: 'workspace-a', setId: id, moduleId: id }],
  ['linked modules', linked, { wsId: 'workspace-a', setId: id, moduleId: id }],
  ['module quiz sets', sets, { wsId: 'workspace-a', setId: id, moduleId: id }],
] as const) {
  it(`denies foreign ${name} before listing content`, async () => {
    const response = await handler(
      new NextRequest('http://localhost/resource'),
      { params }
    );
    expect(response.status).toBe(404);
    expect(state.from).not.toHaveBeenCalledWith('quiz_set_quizzes');
    expect(state.from).not.toHaveBeenCalledWith('course_module_quiz_sets');
  });
  it(`preserves owned ${name}`, async () => {
    state.own = true;
    const response = await handler(
      new NextRequest('http://localhost/resource'),
      { params }
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: [{ id: 'private-content' }],
    });
  });
}

it('rejects an ai_lab-only member before reading quiz-set answers', async () => {
  state.own = true;
  state.permissions = ['ai_lab'];
  const response = await quizzes(new NextRequest('http://localhost/resource'), {
    params: { wsId: 'workspace-a', setId: id },
  });
  expect(response.status).toBe(403);
  expect(state.from.mock.calls.map(([table]) => table)).toEqual([
    'workspace_secrets',
  ]);
});

it.each(['view_user_groups', 'update_user_groups'])(
  'returns quiz-set answers with %s alone',
  async (permission) => {
    state.own = true;
    state.permissions = [permission];
    const response = await quizzes(
      new NextRequest('http://localhost/resource'),
      {
        params: { wsId: 'workspace-a', setId: id },
      }
    );
    expect(response.status).toBe(200);
    expect(state.from).toHaveBeenCalledWith('quiz_set_quizzes');
  }
);

it('preserves quiz-set metadata access for an ai_lab-only member', async () => {
  state.own = true;
  state.permissions = ['ai_lab'];
  const response = await linked(new NextRequest('http://localhost/resource'), {
    params: { wsId: 'workspace-a', setId: id },
  });
  expect(response.status).toBe(200);
});
