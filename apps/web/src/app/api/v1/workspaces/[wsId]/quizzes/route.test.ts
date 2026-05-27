import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const requireTeachWorkspaceAccess = vi.fn();

  const quizzesBuilder: Record<string, any> = Promise.resolve({
    data: [
      {
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
    select: vi.fn(() => quizzesBuilder),
    update: vi.fn(() => updateQuizBuilder),
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
  };

  return {
    requireTeachWorkspaceAccess,
    deleteQuizOptionsBuilder,
    quizOptionsTable,
    quizzesBuilder,
    sessionSupabase,
    updateQuizBuilder,
    workspaceQuizzesTable,
  };
});

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

vi.mock('@/lib/teach/api', () => ({
  requireTeachWorkspaceAccess: (
    ...args: Parameters<typeof mocks.requireTeachWorkspaceAccess>
  ) => mocks.requireTeachWorkspaceAccess(...args),
}));

describe('workspace quizzes route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
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

    const { GET } = await import(
      '@/app/api/v1/workspaces/[wsId]/quizzes/route'
    );

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
    const { GET } = await import(
      '@/app/api/v1/workspaces/[wsId]/quizzes/route'
    );

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/quizzes?page=1&pageSize=20'
      ),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.count).toBe(1);
    expect(payload.data[0].quiz_options[0].is_correct).toBe(true);
    expect(mocks.quizzesBuilder.eq).toHaveBeenCalledWith(
      'ws_id',
      '00000000-0000-0000-0000-000000000001'
    );
  });

  it('does not reset quiz options when update payload omits options', async () => {
    const { POST } = await import(
      '@/app/api/v1/workspaces/[wsId]/quizzes/route'
    );

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

  it('does not update quiz relations when the quiz is outside the workspace', async () => {
    mocks.updateQuizBuilder.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { POST } = await import(
      '@/app/api/v1/workspaces/[wsId]/quizzes/route'
    );

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
