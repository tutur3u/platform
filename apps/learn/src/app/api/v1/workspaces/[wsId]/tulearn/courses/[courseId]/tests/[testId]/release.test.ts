// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  attempt: null as Record<string, unknown> | null,
  quizzes: [] as Record<string, unknown>[],
  submit: vi.fn(),
  test: {} as Record<string, unknown>,
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
        { wsId: 'workspace', courseId: 'course', testId: 'test' }
      ),
}));
vi.mock('@/lib/tulearn-test-access', () => ({
  canAccessLearnerTestCourse: async () => true,
}));
vi.mock('@tuturuuu/education-core/tulearn/service', () => ({
  resolveTulearnSubject: async () => ({
    wsId: 'workspace',
    studentWorkspaceUserId: 'student',
    studentPlatformUserId: 'platform-student',
    readOnly: false,
  }),
  tulearnAccessErrorResponse: () => null,
}));
vi.mock('@tuturuuu/education-core/tulearn/test-session', () => ({
  isAttemptExpired: () => false,
  submitTestAttemptInternal: state.submit,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    from: (table: string) => {
      let rows: Record<string, unknown>[] =
        table === 'course_test_quizzes'
          ? state.quizzes.map((quiz) => ({ quiz_id: quiz.id }))
          : table === 'workspace_quizzes'
            ? state.quizzes
            : [];
      const query: Record<string, unknown> = {
        eq: (column: string, value: string) => {
          if (table === 'workspace_quizzes' && column === 'ws_id') {
            rows = rows.filter((row) => row.ws_id === value);
          }
          return query;
        },
        in: () => query,
        order: () => query,
        select: () => query,
        maybeSingle: async () => ({
          data:
            table === 'course_tests'
              ? state.test
              : table === 'course_test_attempts'
                ? state.attempt
                : null,
          error: null,
        }),
        then: (resolve: (value: unknown) => unknown) =>
          resolve({ data: rows, error: null }),
      };
      return query;
    },
  }),
}));

const params = {
  params: Promise.resolve({
    wsId: 'workspace',
    courseId: 'course',
    testId: 'test',
  }),
};

beforeEach(() => {
  vi.clearAllMocks();
  state.test = {
    id: 'test',
    course_id: 'course',
    duration_in_minutes: null,
    is_published: true,
    is_score_published: false,
  };
  state.attempt = {
    id: 'attempt',
    started_at: new Date().toISOString(),
    submitted_at: null,
    score: null,
  };
  state.quizzes = [
    {
      id: 'matching',
      ws_id: 'workspace',
      question: 'Match',
      type: 'matching',
      score: 1,
      // A row written before keys moved still holds the pairs.
      content: {
        pairs: [
          { left: 'Cat', right: 'Meo' },
          { left: 'Dog', right: 'Gau' },
        ],
      },
      quiz_options: [],
    },
    {
      id: 'ordering',
      ws_id: 'workspace',
      question: 'Order',
      type: 'ordering',
      score: 1,
      content: { items: ['one', 'two', 'three'] },
      quiz_options: [],
    },
  ];
});

it('sends an active test only the learner prompt', async () => {
  state.quizzes.push({
    id: 'foreign',
    ws_id: 'another-workspace',
    type: 'multiple_choice',
  });
  state.attempt = { ...state.attempt, score: 7 };

  const { GET } = await import('./attempt/route');
  const response = await GET(
    new NextRequest('http://localhost/api/tests'),
    params
  );
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.attempt.score).toBeNull();
  expect(body.quizzes).toHaveLength(2);
  const matching = body.quizzes.find(
    (quiz: { id: string }) => quiz.id === 'matching'
  );
  expect(JSON.stringify(matching.content)).not.toContain('right');
  expect(matching.content.pairs).toEqual([{ left: 'Cat' }, { left: 'Dog' }]);
  const ordering = body.quizzes.find(
    (quiz: { id: string }) => quiz.id === 'ordering'
  );
  expect([...ordering.content.items].sort()).toEqual(['one', 'three', 'two']);

  // The legacy authored order cannot be read back from the prompt.
  state.quizzes[1] = {
    ...state.quizzes[1],
    content: { items: ['three', 'one', 'two'] },
  };
  const reordered = await (
    await GET(new NextRequest('http://localhost/api/tests'), params)
  ).json();
  expect(
    reordered.quizzes.find((quiz: { id: string }) => quiz.id === 'ordering')
      .content.items
  ).toEqual(ordering.content.items);
});

it('withholds the score from a submit until the teacher releases it', async () => {
  state.submit.mockResolvedValue({
    id: 'attempt',
    submitted_at: new Date().toISOString(),
    score: 7,
  });
  const { POST } = await import('./submit/route');
  const request = () =>
    new NextRequest('http://localhost/api/tests', {
      method: 'POST',
      body: JSON.stringify({
        attemptId: '00000000-0000-4000-8000-000000008001',
      }),
    });

  const hidden = await (await POST(request(), params)).json();
  expect(hidden.attempt.score).toBeNull();

  state.test = { ...state.test, is_score_published: true };
  const released = await (await POST(request(), params)).json();
  expect(released.attempt.score).toBe(7);
});
