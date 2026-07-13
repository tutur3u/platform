import { type NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const IDS = {
  attemptId: '44444444-4444-4444-8444-444444444444',
  courseId: '22222222-2222-4222-8222-222222222222',
  quizId: '55555555-5555-4555-8555-555555555555',
  testId: '33333333-3333-4333-8333-333333333333',
  workspaceId: '11111111-1111-4111-8111-111111111111',
};

const mocks = vi.hoisted(() => {
  const results = new Map<string, { data: unknown; error: unknown }>();

  function createQuery(table: string) {
    const query = {
      eq: vi.fn(() => query),
      maybeSingle: vi.fn(async () =>
        Promise.resolve(
          results.get(table) ?? {
            data: null,
            error: new Error(`Missing result for ${table}`),
          }
        )
      ),
      select: vi.fn(() => query),
    };
    return query;
  }

  return {
    after: vi.fn((callback: () => unknown) => callback()),
    capMaxOutputTokensByCredits: vi.fn(),
    checkAiCredits: vi.fn(),
    deductAiCredits: vi.fn(),
    generateObject: vi.fn(),
    google: vi.fn((modelId: string) => ({ modelId })),
    requireTeachWorkspaceAccess: vi.fn(),
    results,
    sbAdmin: {
      from: vi.fn((table: string) => createQuery(table)),
    },
    validateTeachCourse: vi.fn(),
    withAiMemory: vi.fn(async ({ model }: { model: unknown }) => model),
  };
});

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: unknown) =>
    async (
      request: NextRequest,
      routeContext?: { params?: Promise<unknown> | unknown }
    ) =>
      (
        handler as (
          request: NextRequest,
          context: { supabase: unknown; user: { id: string } },
          params: typeof IDS
        ) => Promise<Response>
      )(
        request,
        { supabase: {}, user: { id: 'user-1' } },
        (await Promise.resolve(routeContext?.params)) as typeof IDS
      ),
}));

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: mocks.after };
});

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

vi.mock('@tuturuuu/education-core/teach/api', () => ({
  requireTeachWorkspaceAccess: (
    ...args: Parameters<typeof mocks.requireTeachWorkspaceAccess>
  ) => mocks.requireTeachWorkspaceAccess(...args),
  validateTeachCourse: (
    ...args: Parameters<typeof mocks.validateTeachCourse>
  ) => mocks.validateTeachCourse(...args),
}));

vi.mock('ai', () => ({
  generateObject: (...args: Parameters<typeof mocks.generateObject>) =>
    mocks.generateObject(...args),
}));

function request() {
  return new Request('http://localhost/api/test-feedback', {
    body: JSON.stringify({ quizId: IDS.quizId }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  }) as NextRequest;
}

function routeContext() {
  return {
    params: Promise.resolve({
      attemptId: IDS.attemptId,
      courseId: IDS.courseId,
      testId: IDS.testId,
      wsId: IDS.workspaceId,
    }),
  };
}

describe('test submission AI feedback route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.results.clear();
    mocks.results.set('course_tests', {
      data: { id: IDS.testId },
      error: null,
    });
    mocks.results.set('course_test_attempts', {
      data: { id: IDS.attemptId },
      error: null,
    });
    mocks.results.set('course_test_quizzes', {
      data: { quiz_id: IDS.quizId },
      error: null,
    });
    mocks.results.set('workspace_quizzes', {
      data: {
        answer: { correct: 'A' },
        content: { prompt: 'Choose one' },
        question: 'What is A?',
        quiz_options: [],
        type: 'paragraph',
      },
      error: null,
    });
    mocks.results.set('course_test_attempt_answers', {
      data: { answer: '', is_correct: false, selected_option_id: 'fallback' },
      error: null,
    });
    mocks.requireTeachWorkspaceAccess.mockResolvedValue({
      normalizedWsId: IDS.workspaceId,
      sbAdmin: mocks.sbAdmin,
      userId: 'user-1',
    });
    mocks.validateTeachCourse.mockResolvedValue({ id: IDS.courseId });
    mocks.checkAiCredits.mockResolvedValue({
      allowed: true,
      errorCode: null,
      errorMessage: null,
      maxOutputTokens: 256,
      remainingCredits: 10,
    });
    mocks.capMaxOutputTokensByCredits.mockResolvedValue(128);
    mocks.generateObject.mockResolvedValue({
      object: { feedback: 'Helpful feedback.' },
      usage: {
        inputTokens: 20,
        outputTokenDetails: { reasoningTokens: 2 },
        outputTokens: 8,
      },
    });
    mocks.deductAiCredits.mockResolvedValue({ success: true });
  });

  it('requires update access before reading submissions or invoking AI', async () => {
    mocks.requireTeachWorkspaceAccess.mockResolvedValueOnce(
      NextResponse.json({ message: 'Forbidden' }, { status: 403 })
    );
    const { POST } = await import('./route');

    const response = await POST(request(), routeContext());

    expect(response.status).toBe(403);
    expect(mocks.requireTeachWorkspaceAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        permission: 'update_user_groups',
        wsId: IDS.workspaceId,
      })
    );
    expect(mocks.sbAdmin.from).not.toHaveBeenCalled();
    expect(mocks.generateObject).not.toHaveBeenCalled();
  });

  it('does not invoke AI when workspace credits are unavailable', async () => {
    mocks.checkAiCredits.mockResolvedValueOnce({
      allowed: false,
      errorCode: 'NO_BALANCE',
      errorMessage: 'AI credits unavailable',
      maxOutputTokens: null,
      remainingCredits: 0,
    });
    const { POST } = await import('./route');

    const response = await POST(request(), routeContext());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      code: 'NO_BALANCE',
      message: 'AI credits unavailable',
    });
    expect(mocks.generateObject).not.toHaveBeenCalled();
    expect(mocks.deductAiCredits).not.toHaveBeenCalled();
  });

  it('rejects generation when output cannot be capped to remaining credits', async () => {
    mocks.checkAiCredits.mockResolvedValueOnce({
      allowed: true,
      errorCode: null,
      errorMessage: null,
      maxOutputTokens: 256,
      remainingCredits: 0,
    });
    mocks.capMaxOutputTokensByCredits.mockResolvedValueOnce(null);
    const { POST } = await import('./route');

    const response = await POST(request(), routeContext());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      code: 'CREDITS_EXHAUSTED',
      message: 'AI credits insufficient',
    });
    expect(mocks.generateObject).not.toHaveBeenCalled();
    expect(mocks.deductAiCredits).not.toHaveBeenCalled();
  });

  it('uses server-scoped data, preserves an empty answer, and deducts credits', async () => {
    const { POST } = await import('./route');

    const response = await POST(request(), routeContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      feedback: 'Helpful feedback.',
    });
    expect(mocks.generateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        maxOutputTokens: 128,
        prompt: expect.stringContaining('Student\'s Answer: ""'),
      })
    );
    expect(mocks.generateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.not.stringContaining('Student\'s Answer: "fallback"'),
      })
    );
    expect(mocks.deductAiCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        inputTokens: 20,
        modelId: 'google/gemini-2.5-flash',
        outputTokens: 8,
        reasoningTokens: 2,
        userId: 'user-1',
        wsId: IDS.workspaceId,
      })
    );
  });

  it('returns 504 when the AI SDK throws a regular abort error', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    mocks.generateObject.mockRejectedValueOnce(abortError);
    const { POST } = await import('./route');

    const response = await POST(request(), routeContext());

    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toEqual({
      message: 'AI feedback generation timed out',
    });
    expect(mocks.deductAiCredits).not.toHaveBeenCalled();
  });
});
