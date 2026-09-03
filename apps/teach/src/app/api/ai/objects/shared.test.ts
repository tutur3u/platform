import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const mocks = vi.hoisted(() => ({
  capMaxOutputTokensByCredits: vi.fn(),
  calculateUsageCost: vi.fn(),
  checkAiCredits: vi.fn(),
  consumeStream: vi.fn(),
  featureQueryResult: { count: 1, error: null as unknown },
  google: vi.fn((modelId: string) => ({ modelId })),
  requireTeachWorkspaceAccess: vi.fn(),
  releaseFixedAiCreditReservation: vi.fn(),
  reserveFixedAiCredits: vi.fn(),
  sessionOptions: undefined as unknown,
  settleResult: {
    data: [{ credits_deducted: 1, remaining_credits: 19, success: true }],
    error: null as unknown,
  },
  streamText: vi.fn(),
  toTextStreamResponse: vi.fn(
    () =>
      new Response('streamed-object', {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
  ),
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
}));

vi.mock('@tuturuuu/ai/credits/reservations', () => ({
  releaseFixedAiCreditReservation: (
    ...args: Parameters<typeof mocks.releaseFixedAiCreditReservation>
  ) => mocks.releaseFixedAiCreditReservation(...args),
  reserveFixedAiCredits: (
    ...args: Parameters<typeof mocks.reserveFixedAiCredits>
  ) => mocks.reserveFixedAiCredits(...args),
}));

vi.mock('@tuturuuu/ai/memory', () => ({
  withAiMemory: (...args: Parameters<typeof mocks.withAiMemory>) =>
    mocks.withAiMemory(...args),
}));

vi.mock('@tuturuuu/education-core/teach/api', () => ({
  requireTeachWorkspaceAccess: (
    ...args: Parameters<typeof mocks.requireTeachWorkspaceAccess>
  ) => mocks.requireTeachWorkspaceAccess(...args),
}));

vi.mock('ai', () => ({
  Output: { object: vi.fn(({ schema }) => ({ schema })) },
  streamText: (...args: Parameters<typeof mocks.streamText>) =>
    mocks.streamText(...args),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: (
    handler: (
      request: NextRequest,
      context: { supabase: object; user?: { id: string } }
    ) => Promise<Response>,
    options: unknown
  ) => {
    mocks.sessionOptions = options;
    return async (request: NextRequest) => {
      const authorization = request.headers.get('authorization');
      if (authorization !== 'Bearer teach-app-session') {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 401,
        });
      }

      return handler(request, {
        supabase: {},
        user: { id: 'actor-user' },
      });
    };
  },
}));

function createFeatureQuery() {
  let equalityCount = 0;
  const query = {
    eq: vi.fn(() => {
      equalityCount += 1;
      return equalityCount === 3
        ? Promise.resolve(mocks.featureQueryResult)
        : query;
    }),
    select: vi.fn(() => query),
  };
  return query;
}

const sbAdmin = {
  from: vi.fn(() => createFeatureQuery()),
  rpc: vi.fn(async () => mocks.settleResult),
  schema: vi.fn(() => ({
    rpc: mocks.calculateUsageCost,
  })),
};

function createRequest(
  body: unknown = { context: 'Cell biology', wsId: 'submitted-ws' },
  authorization = 'Bearer teach-app-session'
) {
  return new NextRequest('http://localhost/api/ai/objects/test', {
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: {
      authorization,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
}

async function createHandler() {
  const { createTeachObjectGenerationHandler } = await import('./shared');
  return createTeachObjectGenerationHandler({
    buildPrompt: ({ context }) => `Prompt: ${context}`,
    customIdPrefix: 'test-object',
    outputSchema: z.object({ value: z.string() }),
    requestSchema: z
      .object({ context: z.string().trim().min(1), wsId: z.string().min(1) })
      .strict(),
    source: 'test_generation',
    surface: 'test_generation',
  });
}

describe('Teach object-generation handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.featureQueryResult = { count: 1, error: null };
    mocks.requireTeachWorkspaceAccess.mockResolvedValue({
      normalizedWsId: 'normalized-ws',
      sbAdmin,
      userId: 'actor-user',
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
    mocks.calculateUsageCost.mockResolvedValue({
      data: [{ billed_credits: 4 }],
      error: null,
    });
    mocks.reserveFixedAiCredits.mockResolvedValue({
      errorCode: null,
      remainingCredits: 16,
      reservationId: 'reservation-1',
      success: true,
    });
    mocks.releaseFixedAiCreditReservation.mockResolvedValue({
      errorCode: null,
      remainingCredits: 20,
      success: true,
    });
    mocks.settleResult = {
      data: [{ credits_deducted: 1, remaining_credits: 19, success: true }],
      error: null,
    };
    mocks.consumeStream.mockImplementation(async () => {
      const options = mocks.streamText.mock.calls.at(-1)?.[0] as {
        onFinish?: (event: unknown) => Promise<void>;
      };
      await options.onFinish?.({
        usage: {
          inputTokens: 120,
          outputTokenDetails: { reasoningTokens: 7 },
          outputTokens: 32,
        },
      });
    });
    mocks.streamText.mockImplementation(() => ({
      consumeStream: mocks.consumeStream,
      toTextStreamResponse: mocks.toTextStreamResponse,
    }));
  });

  it('reserves before generation and settles normalized usage exactly once', async () => {
    const POST = await createHandler();
    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('streamed-object');
    expect(mocks.sessionOptions).toEqual({
      allowAiTempAuth: true,
      allowAppSessionAuth: { targetApp: 'teach' },
    });
    expect(mocks.requireTeachWorkspaceAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        permission: ['update_user_groups', 'view_user_groups'],
        wsId: 'submitted-ws',
      })
    );
    expect(mocks.checkAiCredits).toHaveBeenCalledWith(
      'normalized-ws',
      'google/gemini-3.1-flash-lite',
      'generate',
      { userId: 'actor-user' }
    );
    expect(mocks.capMaxOutputTokensByCredits).toHaveBeenCalledWith(
      sbAdmin,
      'google/gemini-3.1-flash-lite',
      512,
      20
    );
    expect(mocks.withAiMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { modelId: 'gemini-3.1-flash-lite' },
        source: 'test_generation',
        surface: 'test_generation',
        userId: 'actor-user',
        wsId: 'normalized-ws',
      })
    );
    expect(mocks.reserveFixedAiCredits).toHaveBeenCalledWith(
      {
        amount: 4,
        expiresInSeconds: 900,
        feature: 'generate',
        metadata: {
          source: 'test_generation',
          surface: 'test_generation',
        },
        modelId: 'google/gemini-3.1-flash-lite',
        userId: 'actor-user',
        wsId: 'normalized-ws',
      },
      sbAdmin
    );
    expect(mocks.calculateUsageCost).toHaveBeenCalledWith(
      'calculate_ai_studio_usage_cost',
      {
        p_input_tokens: 20,
        p_model_id: 'google/gemini-3.1-flash-lite',
        p_output_tokens: 256,
        p_reasoning_tokens: 256,
        p_ws_id: 'normalized-ws',
      }
    );
    expect(
      mocks.reserveFixedAiCredits.mock.invocationCallOrder[0]
    ).toBeLessThan(mocks.streamText.mock.invocationCallOrder[0] ?? Infinity);
    await vi.waitFor(() => expect(sbAdmin.rpc).toHaveBeenCalledTimes(1));
    expect(sbAdmin.rpc).toHaveBeenCalledWith(
      'settle_metered_ai_credit_reservation',
      {
        p_input_tokens: 120,
        p_metadata: {
          source: 'test_generation',
          surface: 'test_generation',
        },
        p_output_tokens: 32,
        p_reasoning_tokens: 7,
        p_reservation_id: 'reservation-1',
      }
    );
    expect(mocks.releaseFixedAiCreditReservation).not.toHaveBeenCalled();
    expect(mocks.consumeStream).toHaveBeenCalledTimes(1);
  });

  it('rejects a null output cap before reserving or starting the provider', async () => {
    mocks.capMaxOutputTokensByCredits.mockResolvedValueOnce(null);
    const POST = await createHandler();
    const response = await POST(createRequest());

    expect(response.status).toBe(403);
    expect(mocks.reserveFixedAiCredits).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it.each([
    ['anonymous', ''],
    ['wrong-target app session', 'Bearer inventory-app-session'],
  ])('rejects %s before privileged work', async (_label, authorization) => {
    const POST = await createHandler();
    const response = await POST(createRequest(undefined, authorization));

    expect(response.status).toBe(401);
    expect(mocks.requireTeachWorkspaceAccess).not.toHaveBeenCalled();
    expect(sbAdmin.from).not.toHaveBeenCalled();
    expect(mocks.checkAiCredits).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it.each([
    ['cross-workspace actor', "You don't have access to this workspace"],
    ['missing permission', 'Insufficient permissions'],
  ])('rejects a %s before provider setup', async (_label, message) => {
    mocks.requireTeachWorkspaceAccess.mockResolvedValueOnce(
      NextResponse.json({ message }, { status: 403 })
    );
    const POST = await createHandler();
    const response = await POST(createRequest());

    expect(response.status).toBe(403);
    expect(sbAdmin.from).not.toHaveBeenCalled();
    expect(mocks.checkAiCredits).not.toHaveBeenCalled();
    expect(mocks.withAiMemory).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it('returns 500 for an authorization lookup failure', async () => {
    mocks.requireTeachWorkspaceAccess.mockResolvedValueOnce(
      NextResponse.json(
        { message: 'Failed to verify workspace access' },
        { status: 500 }
      )
    );
    const POST = await createHandler();
    const response = await POST(createRequest());

    expect(response.status).toBe(500);
    expect(sbAdmin.from).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid JSON', '{'],
    ['empty context', { context: '   ', wsId: 'submitted-ws' }],
    [
      'unknown fields',
      { context: 'Cell biology', unexpected: true, wsId: 'submitted-ws' },
    ],
    ['wrong shape', { context: [], wsId: 'submitted-ws' }],
  ])(
    'rejects %s before authorization and AI dependencies',
    async (_label, body) => {
      const POST = await createHandler();
      const response = await POST(createRequest(body));

      expect(response.status).toBe(400);
      expect(mocks.requireTeachWorkspaceAccess).not.toHaveBeenCalled();
      expect(sbAdmin.from).not.toHaveBeenCalled();
      expect(mocks.checkAiCredits).not.toHaveBeenCalled();
      expect(mocks.withAiMemory).not.toHaveBeenCalled();
      expect(mocks.streamText).not.toHaveBeenCalled();
    }
  );

  it('checks the feature gate only after canonical workspace authorization', async () => {
    mocks.featureQueryResult = { count: 0, error: null };
    const POST = await createHandler();
    const response = await POST(createRequest());

    expect(response.status).toBe(403);
    expect(mocks.requireTeachWorkspaceAccess).toHaveBeenCalledOnce();
    expect(sbAdmin.from).toHaveBeenCalledWith('workspace_secrets');
    expect(mocks.checkAiCredits).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it('rejects exhausted credits before provider setup', async () => {
    mocks.checkAiCredits.mockResolvedValueOnce({
      allowed: false,
      errorCode: 'NO_BALANCE',
      errorMessage: 'AI credits unavailable',
      maxOutputTokens: null,
      remainingCredits: 0,
      tier: 'FREE',
    });
    const POST = await createHandler();
    const response = await POST(createRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      code: 'NO_BALANCE',
      error: 'AI credits unavailable',
    });
    expect(mocks.capMaxOutputTokensByCredits).not.toHaveBeenCalled();
    expect(mocks.withAiMemory).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it('returns a generic provider-start failure without exposing details', async () => {
    mocks.streamText.mockImplementationOnce(() => {
      throw new Error('provider-sensitive-detail');
    });
    const POST = await createHandler();
    const response = await POST(createRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Internal Server Error',
    });
    expect(mocks.releaseFixedAiCreditReservation).toHaveBeenCalledWith(
      'reservation-1',
      {
        reason: 'provider_start_error',
        source: 'test_generation',
        surface: 'test_generation',
      },
      sbAdmin
    );
    expect(sbAdmin.rpc).not.toHaveBeenCalled();
  });
});
