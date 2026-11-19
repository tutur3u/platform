import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const inserted = {
  education_learner_quiz_attempts: [] as unknown[],
  education_learner_quiz_attempt_answers: [] as unknown[],
  education_learner_module_progress: [] as unknown[],
};

function requireResponse(response: Response | undefined) {
  if (!response) throw new Error('expected a response');
  return response;
}

function query(data: unknown, count = 0) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const name of ['select', 'eq', 'in', 'order', 'limit', 'delete']) {
    builder[name] = chain;
  }
  builder.single = async () => ({
    data: Array.isArray(data) ? data[0] : data,
    error: null,
  });
  builder.maybeSingle = builder.single;
  builder.then = (
    resolve: (value: { data: unknown; error: null; count: number }) => unknown,
    reject?: (reason: unknown) => unknown
  ) => Promise.resolve({ data, error: null, count }).then(resolve, reject);
  return builder;
}

const mocks = vi.hoisted(() => ({
  requireLearnerWorkspace: vi.fn(),
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

function tables() {
  return {
    workspace_user_groups: query([
      { id: 'course', workspace_course_modules: [{ id: 'module' }] },
    ]),
    education_learner_module_progress: {
      ...query([]),
      upsert: (payload: unknown) => {
        inserted.education_learner_module_progress.push(payload);
        return query(null);
      },
    },
    education_learner_quiz_attempts: {
      ...query([], 0),
      insert: (payload: unknown) => {
        inserted.education_learner_quiz_attempts.push(payload);
        return query({
          id: 'attempt-1',
          attempt_number: 1,
          submitted_at: '2026-11-20T02:00:00.000Z',
        });
      },
      delete: () => query(null),
    },
    education_learner_quiz_attempt_answers: {
      ...query([]),
      insert: (payload: unknown) => {
        inserted.education_learner_quiz_attempt_answers.push(payload);
        return query(null);
      },
    },
    user_private_details: query({
      full_name: 'Ada Lovelace',
      email: 'ada@example.com',
    }),
    workspace_quizzes: query([
      { id: '11111111-1111-4111-8111-111111111111', score: 1 },
    ]),
    quiz_options: query([
      {
        id: '22222222-2222-4222-8222-222222222222',
        quiz_id: '11111111-1111-4111-8111-111111111111',
        is_correct: true,
        points: null,
      },
    ]),
    workspace_course_modules: query([{ id: 'module' }]),
    course_module_quiz_sets: query([{ module_id: 'module', set_id: 'set' }]),
    quiz_set_quizzes: query([
      { set_id: 'set', quiz_id: '11111111-1111-4111-8111-111111111111' },
    ]),
  };
}

describe('learner quiz attempts', () => {
  beforeEach(() => {
    inserted.education_learner_quiz_attempts = [];
    inserted.education_learner_quiz_attempt_answers = [];
    inserted.education_learner_module_progress = [];
    const from = vi.fn(
      (name: keyof ReturnType<typeof tables>) => tables()[name]
    );
    mocks.requireLearnerWorkspace.mockResolvedValue({
      wsId: 'workspace',
      userId: 'learner',
      headers: {},
      sbAdmin: { from, schema: () => ({ from }) },
    });
  });

  it('stores the server grade and completes the linked module', async () => {
    const response = await POST(
      new NextRequest(
        'https://tuturuuu.com/api/v1/workspaces/workspace/education/quiz-attempts',
        {
          method: 'POST',
          body: JSON.stringify({
            course_id: '33333333-3333-4333-8333-333333333333',
            answers: [
              {
                quiz_id: '11111111-1111-4111-8111-111111111111',
                selected_option_id: '22222222-2222-4222-8222-222222222222',
                is_correct: false,
              },
            ],
          }),
        }
      ),
      params
    );

    const saved = requireResponse(response);
    expect(saved.status).toBe(201);
    const body = await saved.json();
    expect(body.attempt.correct_count).toBe(1);
    expect(body.attempt.total_score).toBe(1);
    expect(body.attempt.answers[0].is_correct).toBe(true);
    expect(body.completed_module_ids).toEqual(['module']);
    expect(inserted.education_learner_quiz_attempt_answers[0]).toEqual([
      expect.objectContaining({ is_correct: true, score_awarded: 1 }),
    ]);
  });

  it('rejects an attempt the workspace does not contain', async () => {
    const response = await POST(
      new NextRequest('https://tuturuuu.com/api/v1/education/quiz-attempts', {
        method: 'POST',
        body: JSON.stringify({
          answers: [
            {
              quiz_id: '44444444-4444-4444-8444-444444444444',
              selected_option_id: '22222222-2222-4222-8222-222222222222',
            },
          ],
        }),
      }),
      params
    );
    expect(requireResponse(response).status).toBe(400);
    expect(inserted.education_learner_quiz_attempts).toEqual([]);
  });

  it('returns the learner completion ratio', async () => {
    const response = await GET(
      new NextRequest(
        'https://tuturuuu.com/api/v1/workspaces/workspace/education/learner-progress'
      ),
      params
    );
    const saved = requireResponse(response);
    expect(saved.status).toBe(200);
    const body = await saved.json();
    expect(body.courses[0]).toEqual({
      course_id: 'course',
      completed_modules: 0,
      total_modules: 1,
      completion_ratio: 0,
    });
    expect(body.attempts).toEqual([]);
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
    expect(requireResponse(response).status).toBe(403);
  });
});
