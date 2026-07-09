import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type RouteMocks = ReturnType<typeof createRouteMocks>;

let mocks: RouteMocks;

function createRouteMocks() {
  const requireTeachWorkspaceAccess = vi.fn();

  const quizzesBuilder: Record<string, any> = Promise.resolve({
    data: [
      {
        answer: null,
        created_at: '2026-05-19T00:00:00.000Z',
        id: 'quiz-1',
        question: 'Question?',
        quiz_options: [
          {
            explanation: null,
            id: 'option-1',
            is_correct: true,
            value: 'Answer',
          },
        ],
      },
    ],
    count: 1,
    error: null,
  });
  quizzesBuilder.eq = vi.fn(() => quizzesBuilder);
  quizzesBuilder.ilike = vi.fn(() => quizzesBuilder);
  quizzesBuilder.order = vi.fn(() => quizzesBuilder);
  quizzesBuilder.range = vi.fn(() => quizzesBuilder);

  const updateQuizBuilder: Record<string, any> = {};
  updateQuizBuilder.eq = vi.fn(() => updateQuizBuilder);
  updateQuizBuilder.select = vi.fn(() => updateQuizBuilder);
  updateQuizBuilder.maybeSingle = vi.fn();

  const workspaceQuizzesTable = {
    insert: vi.fn(),
    select: vi.fn(() => quizzesBuilder),
    update: vi.fn(() => updateQuizBuilder),
  };

  const privateAnswerSelectBuilder: Record<string, any> = {};
  privateAnswerSelectBuilder.in = vi.fn(async () => ({
    data: [
      {
        answer: { correct: true },
        quiz_id: 'quiz-1',
      },
    ],
    error: null,
  }));

  const privateAnswerDeleteBuilder: Record<string, any> = {};
  privateAnswerDeleteBuilder.eq = vi.fn(async () => ({ error: null }));

  const privateQuizAnswersTable = {
    delete: vi.fn(() => privateAnswerDeleteBuilder),
    select: vi.fn(() => privateAnswerSelectBuilder),
    upsert: vi.fn(async () => ({ error: null })),
  };

  const deleteQuizOptionsBuilder: Record<string, any> = {};
  deleteQuizOptionsBuilder.eq = vi.fn(async () => ({ error: null }));

  const quizOptionsTable = {
    delete: vi.fn(() => deleteQuizOptionsBuilder),
    insert: vi.fn(async () => ({ error: null })),
  };

  const sessionSupabase = {
    from: vi.fn((table: string) => {
      if (table === 'workspace_quizzes') {
        return workspaceQuizzesTable;
      }

      if (table === 'quiz_options') {
        return quizOptionsTable;
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
    schema: vi.fn((schema: string) => {
      if (schema === 'private') {
        return {
          from: vi.fn((table: string) => {
            if (table === 'workspace_quiz_answers') {
              return privateQuizAnswersTable;
            }

            throw new Error(`Unexpected private table: ${table}`);
          }),
        };
      }

      throw new Error(`Unexpected schema: ${schema}`);
    }),
  };

  return {
    requireTeachWorkspaceAccess,
    deleteQuizOptionsBuilder,
    privateAnswerDeleteBuilder,
    privateAnswerSelectBuilder,
    privateQuizAnswersTable,
    quizOptionsTable,
    quizzesBuilder,
    sessionSupabase,
    updateQuizBuilder,
    workspaceQuizzesTable,
  };
}

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: unknown) =>
    async (
      request: NextRequest,
      routeContext?: { params?: Promise<unknown> }
    ) =>
      (
        handler as (
          request: NextRequest,
          context: {
            user: { id: string };
            supabase: typeof mocks.sessionSupabase;
          },
          params: { wsId: string }
        ) => Promise<Response>
      )(
        request,
        { user: { id: 'user-1' }, supabase: mocks.sessionSupabase },
        (await routeContext?.params) as { wsId: string }
      ),
}));

vi.mock('@tuturuuu/education-core/teach/api', () => ({
  requireTeachWorkspaceAccess: (
    ...args: Parameters<typeof mocks.requireTeachWorkspaceAccess>
  ) => mocks.requireTeachWorkspaceAccess(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('workspace quizzes route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks = createRouteMocks();
    mocks.requireTeachWorkspaceAccess.mockResolvedValue({
      normalizedWsId: '00000000-0000-0000-0000-000000000001',
      ok: true,
      sbAdmin: mocks.sessionSupabase,
    });
    mocks.updateQuizBuilder.maybeSingle.mockResolvedValue({
      data: { id: '00000000-0000-0000-0000-000000000002' },
      error: null,
    });
  });

  it('returns 403 before disclosing answer keys when education access is denied', async () => {
    mocks.requireTeachWorkspaceAccess.mockResolvedValue(
      NextResponse.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      )
    );

    const { GET } = await import('./route');

    const response = await GET(
      new NextRequest('http://localhost/api/v1/workspaces/ws-1/quizzes'),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'Insufficient permissions',
    });
    expect(mocks.sessionSupabase.from).not.toHaveBeenCalled();
  });

  it('returns quiz options for authorized education users', async () => {
    const { GET } = await import('./route');

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/quizzes?page=1&pageSize=20'
      ),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.count).toBe(1);
    expect(payload.data[0].answer).toEqual({ correct: true });
    expect(payload.data[0].quiz_options[0].is_correct).toBe(true);
    expect(mocks.privateQuizAnswersTable.select).toHaveBeenCalledWith(
      'quiz_id, answer'
    );
    expect(mocks.privateAnswerSelectBuilder.in).toHaveBeenCalledWith(
      'quiz_id',
      ['quiz-1']
    );
    expect(mocks.quizzesBuilder.eq).toHaveBeenCalledWith(
      'ws_id',
      '00000000-0000-0000-0000-000000000001'
    );
  });

  it('does not reset quiz options when update payload omits options', async () => {
    const { POST } = await import('./route');

    const response = await POST(
      new NextRequest('http://localhost/api/v1/workspaces/ws-1/quizzes', {
        method: 'POST',
        body: JSON.stringify({
          quizzes: [
            {
              id: '00000000-0000-0000-0000-000000000002',
              question: 'Updated question?',
              type: 'multiple_choice',
            },
          ],
        }),
      }),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.workspaceQuizzesTable.update).toHaveBeenCalledWith({
      question: 'Updated question?',
      type: 'multiple_choice',
    });
    expect(mocks.updateQuizBuilder.eq).toHaveBeenCalledWith(
      'ws_id',
      '00000000-0000-0000-0000-000000000001'
    );
    expect(mocks.quizOptionsTable.delete).not.toHaveBeenCalled();
    expect(mocks.quizOptionsTable.insert).not.toHaveBeenCalled();
  });

  it('stores dynamic answer keys in private storage during bulk updates', async () => {
    const { POST } = await import('./route');

    const response = await POST(
      new NextRequest('http://localhost/api/v1/workspaces/ws-1/quizzes', {
        method: 'POST',
        body: JSON.stringify({
          quizzes: [
            {
              answer: { correct: true },
              id: '00000000-0000-0000-0000-000000000002',
              question: 'Updated question?',
              type: 'true_false',
            },
          ],
        }),
      }),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.workspaceQuizzesTable.update).toHaveBeenCalledWith({
      question: 'Updated question?',
      type: 'true_false',
    });
    expect(mocks.privateQuizAnswersTable.upsert).toHaveBeenCalledWith(
      {
        answer: { correct: true },
        quiz_id: '00000000-0000-0000-0000-000000000002',
      },
      { onConflict: 'quiz_id' }
    );
  });

  it('does not update quiz relations when the quiz is outside the workspace', async () => {
    mocks.updateQuizBuilder.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { POST } = await import('./route');

    const response = await POST(
      new NextRequest('http://localhost/api/v1/workspaces/ws-1/quizzes', {
        method: 'POST',
        body: JSON.stringify({
          quizzes: [
            {
              id: '00000000-0000-0000-0000-000000000003',
              question: 'Cross-workspace question?',
              quiz_options: [
                {
                  value: 'Answer',
                  is_correct: true,
                },
              ],
            },
          ],
        }),
      }),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: 'Quiz not found',
    });
    expect(mocks.quizOptionsTable.delete).not.toHaveBeenCalled();
    expect(mocks.quizOptionsTable.insert).not.toHaveBeenCalled();
  });
});
