import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function requireResponse(response: Response | undefined) {
  if (!response) throw new Error('expected a response');
  return response;
}

type QueryFilter =
  | { op: 'eq'; column: string; value: unknown }
  | { op: 'in'; column: string; values: unknown[] }
  | { op: 'not'; column: string; operator: string; value: unknown };

function query(data: unknown, count = 0) {
  const filters: QueryFilter[] = [];
  let range: { from: number; to: number } | null = null;
  const builder: Record<string, unknown> = { filters };
  const chain = () => builder;
  for (const name of ['select', 'order', 'limit', 'delete']) {
    builder[name] = chain;
  }
  builder.eq = (column: string, value: unknown) => {
    filters.push({ op: 'eq', column, value });
    return builder;
  };
  builder.in = (column: string, values: unknown[]) => {
    filters.push({ op: 'in', column, values });
    return builder;
  };
  builder.not = (column: string, operator: string, value: unknown) => {
    filters.push({ op: 'not', column, operator, value });
    return builder;
  };
  builder.range = (from: number, to: number) => {
    range = { from, to };
    return builder;
  };
  const matched = () => {
    if (!Array.isArray(data)) return data;
    const filtered = data.filter((row) => {
      const record = row as Record<string, unknown>;
      return filters.every((filter) => {
        if (filter.op === 'eq') return record[filter.column] === filter.value;
        if (filter.op === 'in') {
          return filter.values.includes(record[filter.column]);
        }
        return record[filter.column] !== filter.value;
      });
    });
    if (!range) return filtered;
    return filtered.slice(range.from, range.to + 1);
  };
  builder.single = async () => {
    const rows = matched();
    return {
      data: Array.isArray(rows) ? rows[0] : rows,
      error: null,
    };
  };
  builder.maybeSingle = builder.single;
  builder.then = (
    onFulfilled: (value: {
      data: unknown;
      error: null;
      count: number;
    }) => unknown,
    onRejected?: (reason: unknown) => unknown
  ) =>
    Promise.resolve({ data: matched(), error: null, count }).then(
      onFulfilled,
      onRejected
    );
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
import { GET as getPractice, POST } from './route';

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

type CourseFixture = {
  id: string;
  ws_id: string;
  archived: boolean;
  is_guest: boolean | null;
  is_course_published: boolean;
  workspace_course_modules: { id: string }[];
};

function courseFixture(
  id: string,
  modules: string[],
  extra: Partial<CourseFixture> = {}
): CourseFixture {
  return {
    id,
    ws_id: 'workspace',
    archived: false,
    is_guest: false,
    is_course_published: true,
    workspace_course_modules: modules.map((moduleId) => ({ id: moduleId })),
    ...extra,
  };
}

type FixtureRows = {
  workspace_user_groups: CourseFixture[];
  education_learner_module_progress: {
    course_id: string;
    module_id: string;
    ws_id: string;
    user_id: string;
  }[];
  education_learner_quiz_attempts: unknown[];
  user_private_details: { full_name: string; email: string };
  workspace_user_linked_users: { virtual_user_id: string } | null;
  workspace_user_groups_users: { group_id: string; user_id: string }[];
  course_module_quizzes: { module_id: string; quiz_id: string }[];
  course_module_quiz_sets: { module_id: string; set_id: string }[];
  quiz_set_quizzes: { set_id: string; quiz_id: string }[];
  workspace_quizzes: { id: string; ws_id: string }[];
};

function defaultRows(): FixtureRows {
  return {
    workspace_user_groups: [
      courseFixture('course', ['module', 'reading']),
      courseFixture('other-course', ['other-module']),
    ],
    education_learner_module_progress: [],
    education_learner_quiz_attempts: [],
    user_private_details: {
      full_name: 'Ada Lovelace',
      email: 'ada@example.com',
    },
    workspace_user_linked_users: { virtual_user_id: 'student' },
    workspace_user_groups_users: [{ group_id: 'course', user_id: 'student' }],
    course_module_quizzes: [{ module_id: 'module', quiz_id: 'quiz-1' }],
    course_module_quiz_sets: [],
    quiz_set_quizzes: [],
    workspace_quizzes: [{ id: 'quiz-1', ws_id: 'workspace' }],
  };
}

let rows = defaultRows();
const seen: Record<string, Array<{ filters: QueryFilter[] }>> = {};

function tables() {
  const built: Record<string, ReturnType<typeof query>> = {
    workspace_user_groups: query(rows.workspace_user_groups),
    education_learner_module_progress: query(
      rows.education_learner_module_progress
    ),
    education_learner_quiz_attempts: query(
      rows.education_learner_quiz_attempts,
      0
    ),
    user_private_details: query(rows.user_private_details),
    workspace_user_linked_users: query(rows.workspace_user_linked_users),
    workspace_user_groups_users: query(rows.workspace_user_groups_users),
    course_module_quizzes: query(rows.course_module_quizzes),
    course_module_quiz_sets: query(rows.course_module_quiz_sets),
    quiz_set_quizzes: query(rows.quiz_set_quizzes),
    workspace_quizzes: query(rows.workspace_quizzes),
  };
  return built;
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
    rows = defaultRows();
    for (const key of Object.keys(seen)) delete seen[key];
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValue({
      data: {
        replayed: false,
        attempt: savedAttempt,
        completed_module_ids: ['module'],
      },
      error: null,
    });
    const from = vi.fn((name: string) => {
      const builder = tables()[name];
      if (!builder) throw new Error(`unexpected table ${name}`);
      const recorded = builder as { filters: QueryFilter[] };
      (seen[name] ??= []).push(recorded);
      return builder;
    });
    mocks.requireLearnerWorkspace.mockResolvedValue({
      wsId: 'workspace',
      userId: 'learner',
      headers: {},
      sbAdmin: { from, schema: () => ({ from, rpc: mocks.rpc }) },
    });
  });

  it('deduplicates direct and quiz-set questions for an enrolled course', async () => {
    const quiz = {
      id: 'question',
      question: 'Question?',
      quiz_options: [
        { id: 'a', value: 'First option' },
        { id: 'b', value: 'Second option' },
      ],
    };
    const entries = tables();
    entries.workspace_user_groups = query({
      id: savedAttempt.course_id,
      modules: [
        {
          direct: [
            {
              quiz: {
                ...quiz,
                answer: 'First option',
                quiz_options: quiz.quiz_options.map((option) => ({
                  ...option,
                  is_correct: option.id === 'a',
                })),
              },
            },
            { quiz: null },
          ],
          sets: [{ set: { items: [{ quiz }] } }],
        },
      ],
    });
    const from = vi.fn((name: keyof typeof entries) => entries[name]);
    mocks.requireLearnerWorkspace.mockResolvedValue({
      sbAdmin: { from },
      userId: 'learner',
      wsId: 'workspace',
    });
    const request = new NextRequest(
      `https://example.test/quiz-attempts?courseId=${savedAttempt.course_id}`
    );
    const response = requireResponse(await getPractice(request, params));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [quiz] });
    expect(
      (entries.workspace_user_groups as { filters: QueryFilter[] }).filters
    ).toContainEqual({
      op: 'not',
      column: 'is_guest',
      operator: 'is',
      value: true,
    });

    entries.workspace_user_groups_users = query(null);
    from.mockClear();
    expect(requireResponse(await getPractice(request, params)).status).toBe(
      403
    );
    expect(from).not.toHaveBeenCalledWith('workspace_user_groups');
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

  it('lists only the enrolled course and skips its content-only module', async () => {
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
    const filters = seen.workspace_user_groups?.[0]?.filters ?? [];
    expect(filters).toEqual(
      expect.arrayContaining([
        { op: 'eq', column: 'archived', value: false },
        { op: 'eq', column: 'is_course_published', value: true },
        { op: 'not', column: 'is_guest', operator: 'is', value: true },
      ])
    );
    expect(
      filters.some(
        (filter) => filter.op === 'eq' && filter.column === 'is_guest'
      )
    ).toBe(false);
  });

  it('counts direct and quiz-set modules in this workspace only', async () => {
    rows.workspace_user_groups = [
      courseFixture('course', [
        'quiz-module',
        'set-module',
        'reading',
        'foreign-module',
      ]),
    ];
    rows.course_module_quizzes = [
      { module_id: 'quiz-module', quiz_id: 'quiz-1' },
      { module_id: 'foreign-module', quiz_id: 'quiz-foreign' },
    ];
    rows.course_module_quiz_sets = [
      { module_id: 'set-module', set_id: 'set-1' },
    ];
    rows.quiz_set_quizzes = [{ set_id: 'set-1', quiz_id: 'quiz-2' }];
    rows.workspace_quizzes = [
      { id: 'quiz-1', ws_id: 'workspace' },
      { id: 'quiz-2', ws_id: 'workspace' },
      { id: 'quiz-foreign', ws_id: 'other-workspace' },
    ];
    rows.education_learner_module_progress = [
      {
        course_id: 'course',
        module_id: 'reading',
        ws_id: 'workspace',
        user_id: 'learner',
      },
      {
        course_id: 'course',
        module_id: 'quiz-module',
        ws_id: 'workspace',
        user_id: 'learner',
      },
    ];

    const response = await GET(
      new NextRequest(
        'https://tuturuuu.com/api/v1/workspaces/workspace/education/learner-progress'
      ),
      params
    );
    const body = await requireResponse(response).json();
    expect(body.courses).toEqual([
      {
        course_id: 'course',
        completed_modules: 1,
        total_modules: 2,
        completion_ratio: 0.5,
      },
    ]);
  });

  it('does not complete a course that has no quiz-linked modules', async () => {
    rows.workspace_user_groups = [courseFixture('course', ['reading'])];
    rows.course_module_quizzes = [];
    rows.course_module_quiz_sets = [];
    rows.quiz_set_quizzes = [];
    rows.workspace_quizzes = [];
    rows.education_learner_module_progress = [
      {
        course_id: 'course',
        module_id: 'reading',
        ws_id: 'workspace',
        user_id: 'learner',
      },
    ];

    const response = await GET(
      new NextRequest(
        'https://tuturuuu.com/api/v1/workspaces/workspace/education/learner-progress'
      ),
      params
    );
    const body = await requireResponse(response).json();
    expect(body.courses).toEqual([
      {
        course_id: 'course',
        completed_modules: 0,
        total_modules: 0,
        completion_ratio: 0,
      },
    ]);
  });

  it('keeps a course whose guest flag is null and hides a guest course', async () => {
    rows.workspace_user_groups = [
      courseFixture('open', []),
      courseFixture('unset', [], { is_guest: null }),
      courseFixture('guest', [], { is_guest: true }),
    ];
    rows.workspace_user_groups_users = [
      { group_id: 'open', user_id: 'student' },
      { group_id: 'unset', user_id: 'student' },
      { group_id: 'guest', user_id: 'student' },
    ];

    const response = await GET(
      new NextRequest(
        'https://tuturuuu.com/api/v1/workspaces/workspace/education/learner-progress'
      ),
      params
    );
    const body = await requireResponse(response).json();
    expect(
      body.courses.map((course: { course_id: string }) => course.course_id)
    ).toEqual(['open', 'unset']);
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
