import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type RouteMocks = ReturnType<typeof createRouteMocks>;

let mocks: RouteMocks;

function createRouteMocks() {
  const requireTeachWorkspaceAccess = vi.fn();

  const updateQuizBuilder = {
    eq: vi.fn(),
    maybeSingle: vi.fn(),
    select: vi.fn(),
  };
  updateQuizBuilder.eq.mockReturnValue(updateQuizBuilder);
  updateQuizBuilder.select.mockReturnValue(updateQuizBuilder);

  const quizLinksBuilder = {
    eq: vi.fn(),
    select: vi.fn(),
  };
  quizLinksBuilder.select.mockReturnValue(quizLinksBuilder);
  quizLinksBuilder.eq.mockResolvedValue({ data: [], error: null });

  const workspaceQuizzesTable = {
    update: vi.fn(() => updateQuizBuilder),
  };

  const privateQuizAnswersTable = {
    upsert: vi.fn(async () => ({ error: null })),
  };

  const sessionSupabase = {
    from: vi.fn((table: string) => {
      if (table === 'workspace_quizzes') {
        return workspaceQuizzesTable;
      }

      if (table === 'course_module_quizzes') {
        return quizLinksBuilder;
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
    privateQuizAnswersTable,
    quizLinksBuilder,
    requireTeachWorkspaceAccess,
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
          params: { quizId: string; wsId: string }
        ) => Promise<Response>
      )(
        request,
        { user: { id: 'user-1' }, supabase: mocks.sessionSupabase },
        (await routeContext?.params) as { quizId: string; wsId: string }
      ),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/teach/api', () => ({
  requireTeachWorkspaceAccess: (
    ...args: Parameters<typeof mocks.requireTeachWorkspaceAccess>
  ) => mocks.requireTeachWorkspaceAccess(...args),
}));

describe('workspace quiz route', () => {
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

  it('stores dynamic answer keys privately during updates', async () => {
    const { PUT } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/quizzes/[quizId]/route'
    );

    const response = await PUT(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/quizzes/00000000-0000-0000-0000-000000000002',
        {
          method: 'PUT',
          body: JSON.stringify({
            answer: { correctIndex: 1 },
            question: 'Updated question?',
            type: 'multiple_choice',
          }),
        }
      ),
      {
        params: Promise.resolve({
          quizId: '00000000-0000-0000-0000-000000000002',
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.workspaceQuizzesTable.update).toHaveBeenCalledWith({
      question: 'Updated question?',
      type: 'multiple_choice',
    });
    expect(mocks.privateQuizAnswersTable.upsert).toHaveBeenCalledWith(
      {
        answer: { correctIndex: 1 },
        quiz_id: '00000000-0000-0000-0000-000000000002',
      },
      { onConflict: 'quiz_id' }
    );
  });

  it('does not write private answers when the quiz is outside the workspace', async () => {
    mocks.updateQuizBuilder.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });
    const { PUT } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/quizzes/[quizId]/route'
    );

    const response = await PUT(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/quizzes/00000000-0000-0000-0000-000000000003',
        {
          method: 'PUT',
          body: JSON.stringify({
            answer: { correct: true },
            question: 'Cross-workspace question?',
          }),
        }
      ),
      {
        params: Promise.resolve({
          quizId: '00000000-0000-0000-0000-000000000003',
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: 'Quiz not found',
    });
    expect(mocks.privateQuizAnswersTable.upsert).not.toHaveBeenCalled();
  });
});
