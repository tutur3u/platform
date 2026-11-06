// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  assigned: [] as string[],
  from: vi.fn(),
  submit: vi.fn(),
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
    async (request: NextRequest) =>
      handler(
        request,
        { supabase: {}, user: { id: 'actor' } },
        { wsId: 'route-alias', courseId: 'course', testId: 'test' }
      ),
}));
vi.mock('@tuturuuu/education-core/tulearn/service', () => ({
  resolveTulearnSubject: async () => ({
    wsId: 'resolved-workspace',
    studentWorkspaceUserId: 'student',
    studentPlatformUserId: 'platform-student',
    readOnly: false,
  }),
  getAssignedCourseIds: vi.fn(async () => state.assigned),
  tulearnAccessErrorResponse: () => null,
}));
vi.mock('@tuturuuu/education-core/tulearn/test-session', () => ({
  isAttemptExpired: () => false,
  submitTestAttemptInternal: state.submit,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ from: state.from }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.assigned = [];
  state.from.mockImplementation((table: string) => {
    const query = {
      select: () => query,
      eq: () => query,
      upsert: async () => ({ error: null }),
      maybeSingle: async () => ({
        data:
          table === 'course_tests'
            ? { id: 'test', is_published: true, course_id: 'course' }
            : null,
        error: null,
      }),
      single: async () => ({ data: { id: 'attempt' }, error: null }),
    };
    return query;
  });
});
const endpoints = [
  { name: 'start', load: async () => (await import('./start/route')).POST },
  { name: 'attempt', load: async () => (await import('./attempt/route')).GET },
  {
    name: 'save-answer',
    load: async () => (await import('./save-answer/route')).POST,
  },
  { name: 'submit', load: async () => (await import('./submit/route')).POST },
];
it.each(endpoints)(
  'denies an unassigned or foreign course at $name before test or attempt access',
  async ({ load }) => {
    const handler = await load();
    const response = await handler(
      new NextRequest('http://localhost/api/tests', {
        method: 'POST',
        body: JSON.stringify({
          attemptId: '00000000-0000-4000-8000-000000008001',
          quizId: '00000000-0000-4000-8000-000000008002',
        }),
      }),
      {
        params: Promise.resolve({
          wsId: 'route-alias',
          courseId: 'course',
          testId: 'test',
        }),
      }
    );
    expect(response.status).toBe(404);
    expect(state.from).not.toHaveBeenCalledWith('course_tests');
    expect(state.from).not.toHaveBeenCalledWith('course_test_attempts');
    expect(state.submit).not.toHaveBeenCalled();
    const { getAssignedCourseIds } = await import(
      '@tuturuuu/education-core/tulearn/service'
    );
    expect(getAssignedCourseIds).toHaveBeenCalledWith({
      db: expect.anything(),
      wsId: 'resolved-workspace',
      studentWorkspaceUserId: 'student',
    });
  }
);
it('keeps assigned course attempt reads', async () => {
  state.assigned = ['course'];
  const { GET } = await import('./attempt/route');
  const response = await GET(new NextRequest('http://localhost/api/tests'), {
    params: Promise.resolve({
      wsId: 'route-alias',
      courseId: 'course',
      testId: 'test',
    }),
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ attempt: null });
});
