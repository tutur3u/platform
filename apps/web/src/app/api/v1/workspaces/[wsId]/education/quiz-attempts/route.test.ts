import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function requireResponse(response: Response | undefined) {
  if (!response) throw new Error('expected a response');
  return response;
}

function query(data: unknown, count = 0) {
  const builder: Record<string, unknown> = {};
  let rows = data;
  const chain = () => builder;
  for (const name of ['select', 'eq', 'order', 'limit', 'delete']) {
    builder[name] = chain;
  }
  builder.in = (_column: string, values: unknown[]) => {
    if (Array.isArray(rows)) {
      rows = rows.filter((row) => values.includes((row as { id?: string }).id));
    }
    return builder;
  };
  builder.single = async () => ({
    data: Array.isArray(rows) ? rows[0] : rows,
    error: null,
  });
  builder.maybeSingle = builder.single;
  builder.then = (
    resolve: (value: { data: unknown; error: null; count: number }) => unknown,
    reject?: (reason: unknown) => unknown
  ) =>
    Promise.resolve({ data: rows, error: null, count }).then(resolve, reject);
  return builder;
}

const mocks = vi.hoisted(() => ({
  requireLearnerWorkspace: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/education/learner-access', () => mocks);
vi.mock('@/lib/education/learner-progress-flag', () => ({
  learnerProgressRoutesEnabled: () => true,
}));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => {},
}));

import { GET } from '../learner-progress/route';
import { POST } from './route';

const params = { params: Promise.resolve({ wsId: 'workspace' }) };
const savedAttempt = {
  id: 'attempt-1',
  attempt_number: 1,
  correct_count: 1,
  question_count: 1,
  total_score: 1,
  duration_seconds: null,
  submitted_at: '2026-11-20T02:00:00.000Z',
  course_id: '33333333-3333-4333-8333-333333333333',
  user_id: 'learner',
  answers: [
    {
      quiz_id: '11111111-1111-4111-8111-111111111111',
      selected_option_id: '22222222-2222-4222-8222-222222222222',
      is_correct: true,
      score_awarded: 1,
    },
  ],
};

function tables() {
  return {
    workspace_user_groups: query([
      { id: 'course', workspace_course_modules: [{ id: 'module' }] },
      {
        id: 'other-course',
        workspace_course_modules: [{ id: 'other-module' }],
      },
    ]),
    education_learner_module_progress: query([]),
    education_learner_quiz_attempts: query([], 0),
    user_private_details: query({
      full_name: 'Ada Lovelace',
      email: 'ada@example.com',
    }),
    workspace_user_linked_users: query({ virtual_user_id: 'student' }),
    workspace_user_groups_users: query([{ group_id: 'course' }]),
  };
}

function attemptBody(extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    course_id: '33333333-3333-4333-8333-333333333333',
    idempotency_key: 'attempt-key',
    answers: [
      {
        quiz_id: '11111111-1111-4111-8111-111111111111',
        selected_option_id: '22222222-2222-4222-8222-222222222222',
        is_correct: false,
      },
    ],
    ...extra,
  });
}

describe('learner quiz attempts', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValue({
      data: {
        replayed: false,
        attempt: savedAttempt,
        completed_module_ids: ['module'],
      },
      error: null,
    });
    const from = vi.fn(
      (name: keyof ReturnType<typeof tables>) => tables()[name]
    );
    mocks.requireLearnerWorkspace.mockResolvedValue({
      wsId: 'workspace',
      userId: 'learner',
      headers: {},
      sbAdmin: { from, schema: () => ({ from, rpc: mocks.rpc }) },
    });
  });

  it('returns the server grade for a new attempt', async () => {
    const response = await POST(
      new NextRequest(
        'https://tuturuuu.com/api/v1/workspaces/workspace/education/quiz-attempts',
        { method: 'POST', body: attemptBody() }
      ),
      params
    );

    const saved = requireResponse(response);
    expect(saved.status).toBe(201);
    const body = await saved.json();
    expect(body.attempt.correct_count).toBe(1);
    expect(body.attempt.answers[0].is_correct).toBe(true);
    expect(body.completed_module_ids).toEqual(['module']);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'submit_education_learner_attempt',
      expect.objectContaining({
        p_ws_id: 'workspace',
        p_user_id: 'learner',
        p_course_id: '33333333-3333-4333-8333-333333333333',
        p_idempotency_key: 'attempt-key',
        p_answers: [
          {
            quiz_id: '11111111-1111-4111-8111-111111111111',
            selected_option_id: '22222222-2222-4222-8222-222222222222',
          },
        ],
      })
    );
  });

  it('returns the original attempt when the key is replayed', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        replayed: true,
        attempt: savedAttempt,
        completed_module_ids: ['module'],
      },
      error: null,
    });
    const response = await POST(
      new NextRequest('https://tuturuuu.com/api/v1/education/quiz-attempts', {
        method: 'POST',
        body: attemptBody(),
      }),
      params
    );
    expect(requireResponse(response).status).toBe(200);
  });

  it('requires a course and an idempotency key', async () => {
    const response = await POST(
      new NextRequest('https://tuturuuu.com/api/v1/education/quiz-attempts', {
        method: 'POST',
        body: JSON.stringify({
          answers: [
            {
              quiz_id: '11111111-1111-4111-8111-111111111111',
              selected_option_id: '22222222-2222-4222-8222-222222222222',
            },
          ],
        }),
      }),
      params
    );
    expect(requireResponse(response).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('maps a rate limit to 429 and a missing enrollment to 403', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'P4290', message: 'too many attempts' },
    });
    const limited = await POST(
      new NextRequest('https://tuturuuu.com/api/v1/education/quiz-attempts', {
        method: 'POST',
        body: attemptBody(),
      }),
      params
    );
    expect(requireResponse(limited).status).toBe(429);

    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: '42501',
        message: 'learner is not enrolled in this course',
      },
    });
    const denied = await POST(
      new NextRequest('https://tuturuuu.com/api/v1/education/quiz-attempts', {
        method: 'POST',
        body: attemptBody(),
      }),
      params
    );
    expect(requireResponse(denied).status).toBe(403);
  });

  it('lists only the enrolled course', async () => {
    const response = await GET(
      new NextRequest(
        'https://tuturuuu.com/api/v1/workspaces/workspace/education/learner-progress'
      ),
      params
    );
    const saved = requireResponse(response);
    expect(saved.status).toBe(200);
    const body = await saved.json();
    expect(body.courses).toEqual([
      {
        course_id: 'course',
        completed_modules: 0,
        total_modules: 1,
        completion_ratio: 0,
      },
    ]);
  });

  it('lists no courses when the platform user has no student link', async () => {
    const from = vi.fn((name: keyof ReturnType<typeof tables>) => {
      if (name === 'workspace_user_linked_users') return query(null);
      return tables()[name];
    });
    mocks.requireLearnerWorkspace.mockResolvedValue({
      wsId: 'workspace',
      userId: 'learner',
      headers: {},
      sbAdmin: { from, schema: () => ({ from, rpc: mocks.rpc }) },
    });
    const response = await GET(
      new NextRequest(
        'https://tuturuuu.com/api/v1/workspaces/workspace/education/learner-progress'
      ),
      params
    );
    const body = await requireResponse(response).json();
    expect(body.courses).toEqual([]);
  });

  it('does not grade for a non-member', async () => {
    mocks.requireLearnerWorkspace.mockResolvedValue({
      error: new Response(JSON.stringify({ message: 'Forbidden' }), {
        status: 403,
      }),
    });
    const response = await POST(
      new NextRequest('https://tuturuuu.com/api/v1/education/quiz-attempts', {
        method: 'POST',
        body: attemptBody(),
      }),
      params
    );
    expect(requireResponse(response).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
