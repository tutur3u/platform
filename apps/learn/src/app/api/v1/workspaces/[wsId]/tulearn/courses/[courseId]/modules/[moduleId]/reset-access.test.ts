import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  module: vi.fn(),
  writes: vi.fn(),
  completion: vi.fn(),
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
vi.mock('@tuturuuu/education-core/tulearn/completion', () => ({
  updateModuleCompletionStatus: state.completion,
}));
vi.mock('@tuturuuu/education-core/tulearn/quiz-content', () => ({}));
vi.mock('@tuturuuu/education-core/tulearn/service', () => ({
  getLearnerModuleDetail: state.module,
  resolveTulearnSubject: async () => ({
    wsId: 'workspace-a',
    studentPlatformUserId: 'student',
    studentWorkspaceUserId: 'virtual',
    readOnly: false,
  }),
  tulearnAccessErrorResponse: () => null,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({
          data: { quiz_deadline: null },
          error: null,
        }),
        delete: () => {
          state.writes(table);
          return query;
        },
        // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are awaitable.
        then: (resolve: (value: unknown) => void) => resolve({ error: null }),
      };
      return query;
    },
  }),
}));

import { DELETE } from './route';

beforeEach(() => {
  state.module.mockReset().mockResolvedValue(null);
  state.writes.mockReset();
  state.completion.mockReset();
});
function reset() {
  return DELETE(new NextRequest('http://localhost/module'), {
    params: { wsId: 'workspace-a', courseId: 'course', moduleId: 'module' },
  });
}
it('denies a reset outside the assigned course without progress writes', async () => {
  expect((await reset()).status).toBe(404);
  expect(state.writes).not.toHaveBeenCalled();
  expect(state.completion).not.toHaveBeenCalled();
});
it('preserves reset inside an assigned course', async () => {
  state.module.mockResolvedValue({ id: 'module', quiz_deadline: null });
  expect((await reset()).status).toBe(200);
  expect(state.module).toHaveBeenCalledWith(
    expect.objectContaining({
      courseId: 'course',
      moduleId: 'module',
      wsId: 'workspace-a',
      studentWorkspaceUserId: 'virtual',
    })
  );
  expect(state.completion).toHaveBeenCalledOnce();
});
