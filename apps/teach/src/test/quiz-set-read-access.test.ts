import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ own: false, from: vi.fn() }));
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
vi.mock('@tuturuuu/education-core/education/access', () => ({
  requireEducationWorkspaceAccess: async () => ({
    normalizedWsId: 'workspace-a',
    sbAdmin: { from: state.from },
  }),
}));

import { GET as sets } from '../app/api/v1/workspaces/[wsId]/course-modules/[moduleId]/quiz-sets/route';
import { GET as linked } from '../app/api/v1/workspaces/[wsId]/quiz-sets/[setId]/linked-modules/route';
import { GET as quizzes } from '../app/api/v1/workspaces/[wsId]/quiz-sets/[setId]/quizzes/route';

beforeEach(() => {
  state.own = false;
  state.from.mockReset().mockImplementation((_table: string) => {
    const filters: Record<string, string> = {};
    const query = {
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
          state.own &&
          (filters.ws_id === 'workspace-a' ||
            filters['workspace_user_groups.ws_id'] === 'workspace-a')
            ? { id: 'resource' }
            : null,
        error: null,
      }),
      // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are awaitable.
      then: (resolve: (value: unknown) => void) =>
        resolve({ data: [{ id: 'private-content' }], count: 1, error: null }),
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
