import { type NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const LESSON_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = 'workspace-1';

const mocks = vi.hoisted(() => ({
  capMaxOutputTokensByCredits: vi.fn(),
  checkAiCredits: vi.fn(),
  deductAiCredits: vi.fn(),
  generateObject: vi.fn(),
  google: vi.fn((modelId: string) => ({ modelId })),
  requireTeachWorkspaceAccess: vi.fn(),
  revalidateCourseModuleQuizPaths: vi.fn(),
  sbAdmin: {
    from: vi.fn(),
  },
  serverLogger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
  sessionSupabase: {
    from: vi.fn(),
  },
  setPrivateWorkspaceQuizAnswer: vi.fn(),
  withAiMemory: vi.fn(async ({ model }: { model: unknown }) => model),
}));

vi.mock('@ai-sdk/google', () => ({
  google: (...args: Parameters<typeof mocks.google>) => mocks.google(...args),
}));

vi.mock('@tuturuuu/ai/credits/cap-output-tokens', () => ({
  capMaxOutputTokensByCredits: (
    ...args: Parameters<typeof mocks.capMaxOutputTokensByCredits>
  ) => mocks.capMaxOutputTokensByCredits(...args),
}));

vi.mock('@tuturuuu/ai/credits/check-credits', () => ({
  checkAiCredits: (...args: Parameters<typeof mocks.checkAiCredits>) =>
    mocks.checkAiCredits(...args),
  deductAiCredits: (...args: Parameters<typeof mocks.deductAiCredits>) =>
    mocks.deductAiCredits(...args),
}));

vi.mock('@tuturuuu/ai/memory', () => ({
  withAiMemory: (...args: Parameters<typeof mocks.withAiMemory>) =>
    mocks.withAiMemory(...args),
}));

vi.mock('ai', () => ({
  generateObject: (...args: Parameters<typeof mocks.generateObject>) =>
    mocks.generateObject(...args),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: (handler: unknown) => async (request: Request) =>
    (
      handler as (
        request: Request,
        context: {
          supabase: typeof mocks.sessionSupabase;
          user: { id: string };
        }
      ) => Promise<Response>
    )(request, {
      supabase: mocks.sessionSupabase,
      user: { id: 'user-1' },
    }),
}));

vi.mock('@/lib/education/private-quiz-answers', () => ({
  setPrivateWorkspaceQuizAnswer: (
    ...args: Parameters<typeof mocks.setPrivateWorkspaceQuizAnswer>
  ) => mocks.setPrivateWorkspaceQuizAnswer(...args),
}));

vi.mock('@/lib/education/revalidate-quiz-paths', () => ({
  revalidateCourseModuleQuizPaths: (
    ...args: Parameters<typeof mocks.revalidateCourseModuleQuizPaths>
  ) => mocks.revalidateCourseModuleQuizPaths(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: mocks.serverLogger,
}));

vi.mock('@/lib/teach/api', () => ({
  requireTeachWorkspaceAccess: (
    ...args: Parameters<typeof mocks.requireTeachWorkspaceAccess>
  ) => mocks.requireTeachWorkspaceAccess(...args),
}));

function createQuery(result: { data: unknown; error: unknown }) {
  const query = {
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
    select: vi.fn(() => query),
  };

  return query;
}

function setupSuccessfulTables() {
  const lessonQuery = createQuery({
    data: {
      content: { text: 'Photosynthesis converts light into energy.' },
      extra_content: null,
      id: LESSON_ID,
      name: 'Photosynthesis',
    },
    error: null,
  });
  const workspaceQuizzesTable = {
    delete: vi.fn(() => ({ in: vi.fn(async () => ({ error: null })) })),
    insert: vi.fn(async () => ({ error: null })),
  };
  const courseModuleQuizzesTable = {
    delete: vi.fn(() => ({ in: vi.fn(async () => ({ error: null })) })),
    insert: vi.fn(async () => ({ error: null })),
  };

  mocks.sbAdmin.from.mockImplementation((table: string) => {
    if (table === 'workspace_course_modules') return lessonQuery;
    if (table === 'workspace_quizzes') return workspaceQuizzesTable;
    if (table === 'course_module_quizzes') return courseModuleQuizzesTable;
    throw new Error(`Unexpected table: ${table}`);
  });

  return { courseModuleQuizzesTable, lessonQuery, workspaceQuizzesTable };
}

function createQuizRequest(overrides: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/ai/quiz', {
    body: JSON.stringify({
      count: 1,
      lessonId: LESSON_ID,
      questionType: 'true_false',
      wsId: WORKSPACE_ID,
      ...overrides,
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  }) as NextRequest;
}

describe('quiz generation route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    setupSuccessfulTables();
    mocks.requireTeachWorkspaceAccess.mockResolvedValue({
      normalizedWsId: WORKSPACE_ID,
      sbAdmin: mocks.sbAdmin,
      userId: 'user-1',
    });
    mocks.checkAiCredits.mockResolvedValue({
      allowed: true,
      errorCode: null,
      errorMessage: null,
      maxOutputTokens: 512,
      remainingCredits: 20,
      tier: 'PRO',
    });
    mocks.capMaxOutputTokensByCredits.mockResolvedValue(256);
    mocks.generateObject.mockResolvedValue({
      object: {
        quizzes: [
          {
            correct_boolean: true,
            question: 'Photosynthesis uses light.',
            score: 1,
            type: 'true_false',
          },
        ],
      },
      usage: {
        inputTokens: 120,
        outputTokenDetails: { reasoningTokens: 7 },
        outputTokens: 32,
      },
    });
    mocks.deductAiCredits.mockResolvedValue({
      creditsDeducted: 1,
      errorCode: null,
      remainingCredits: 19,
      success: true,
    });
    mocks.revalidateCourseModuleQuizPaths.mockResolvedValue(undefined);
    mocks.setPrivateWorkspaceQuizAnswer.mockResolvedValue(undefined);
  });

  it('checks AI credits before generating quizzes', async () => {
    mocks.checkAiCredits.mockResolvedValueOnce({
      allowed: false,
      errorCode: 'NO_BALANCE',
      errorMessage: 'AI credits unavailable',
      maxOutputTokens: null,
      remainingCredits: 0,
      tier: 'FREE',
    });

    const { POST } = await import('./route');
    const response = await POST(createQuizRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      code: 'NO_BALANCE',
      error: 'AI credits unavailable',
    });
    expect(mocks.checkAiCredits).toHaveBeenCalledWith(
      WORKSPACE_ID,
      'google/gemini-2.5-flash',
      'generate',
      { userId: 'user-1' }
    );
    expect(mocks.capMaxOutputTokensByCredits).not.toHaveBeenCalled();
    expect(mocks.generateObject).not.toHaveBeenCalled();
    expect(mocks.deductAiCredits).not.toHaveBeenCalled();
  });

  it('caps output tokens and deducts credits after successful generation', async () => {
    const { POST } = await import('./route');
    const response = await POST(createQuizRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      count: 1,
      success: true,
    });
    expect(mocks.capMaxOutputTokensByCredits).toHaveBeenCalledWith(
      mocks.sbAdmin,
      'google/gemini-2.5-flash',
      512,
      20
    );
    expect(mocks.generateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        maxOutputTokens: 256,
      })
    );
    expect(mocks.google).toHaveBeenCalledWith('gemini-2.5-flash');
    expect(mocks.deductAiCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: 'generate',
        inputTokens: 120,
        metadata: expect.objectContaining({
          count: 1,
          lessonId: LESSON_ID,
          questionType: 'true_false',
          source: 'quiz_generation',
        }),
        modelId: 'google/gemini-2.5-flash',
        outputTokens: 32,
        reasoningTokens: 7,
        userId: 'user-1',
        wsId: WORKSPACE_ID,
      })
    );
  });

  it('returns Teach access errors before checking credits', async () => {
    mocks.requireTeachWorkspaceAccess.mockResolvedValueOnce(
      NextResponse.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      )
    );

    const { POST } = await import('./route');
    const response = await POST(createQuizRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'Insufficient permissions',
    });
    expect(mocks.checkAiCredits).not.toHaveBeenCalled();
    expect(mocks.generateObject).not.toHaveBeenCalled();
  });
});
