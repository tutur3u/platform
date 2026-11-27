import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { generateWorldDraft } from './runtime';

const mocks = vi.hoisted(() => ({
  begin: vi.fn(),
  capacity: vi.fn(),
  cost: vi.fn(),
  settle: vi.fn(),
  step: vi.fn(),
  stream: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('ai', async (importOriginal) => {
  const sdk = await importOriginal<typeof import('ai')>();
  return { ...sdk, streamText: mocks.stream };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => ({}),
}));
vi.mock('@tuturuuu/ai/credits/resolve-plan-model', () => ({
  resolvePlanModel: async () => ({ modelId: 'google/gemini-3.1-flash-lite' }),
}));
vi.mock('@tuturuuu/ai/credits/check-credits', () => ({
  checkAiCredits: async () => ({
    allowed: true,
    remainingCredits: 100,
    tier: 'FREE',
  }),
}));
vi.mock('@tuturuuu/ai/credits/cap-output-tokens', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@tuturuuu/ai/credits/cap-output-tokens')
  >()),
  readModelTokenPrices: async () => ({
    inputPricePerToken: 0.00000025,
    outputPricePerToken: 0.0000015,
  }),
  readPlanBudgetPolicy: async () => ({
    markupMultiplier: 1,
    dailyLimit: 100,
    maxRequestsPerDay: 3,
  }),
}));
vi.mock('@tuturuuu/ai/credits/daily-capacity', () => ({
  readDailyCapacitySnapshot: async () => ({
    settledCredits: 0,
    heldCredits: 0,
    requestCount: 0,
  }),
  verifyDailyCapacityWithActiveHolds: mocks.capacity,
}));
vi.mock('@tuturuuu/ai/studio/metering', () => ({
  beginAiStudioRun: mocks.begin,
  calculateAiStudioUsageCost: mocks.cost,
  recordAiStudioRunStep: mocks.step,
  settleAiStudioRun: mocks.settle,
}));

const scope = { workspaceId: 'workspace', worldId: 'world', actorId: 'actor' };
const request = {
  workspaceId: 'workspace',
  worldId: 'world',
  requestId: 'request',
  kind: 'prompt',
  instruction: 'Add a stage',
} as const;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'local-transport-test');
  mocks.begin.mockResolvedValue({ runId: 'run', reservationId: 'hold' });
  mocks.capacity.mockResolvedValue('ok');
  mocks.cost.mockResolvedValue({ billedCredits: 2, providerCostUsd: 0.0002 });
  mocks.settle.mockResolvedValue(undefined);
  mocks.step.mockResolvedValue(undefined);
});

test.each(['overflow', 'error', 'abort'] as const)(
  'settles reported usage on %s',
  async (failure) => {
    const controller = new AbortController();
    mocks.stream.mockReturnValue({
      fullStream: (async function* () {
        yield {
          type: 'text-delta',
          text: failure === 'overflow' ? 'a'.repeat(65_537) : '{}',
        };
        yield {
          type: 'finish-step',
          usage: {
            inputTokens: 12,
            outputTokens: 10,
            outputTokenDetails: { reasoningTokens: 3 },
          },
        };
        if (failure === 'error') throw Error('stream failed');
        if (failure === 'abort') controller.abort();
      })(),
    });

    const result = generateWorldDraft(scope, request, controller.signal);
    if (failure === 'abort') await expect(result).rejects.toThrow();
    else await expect(result).resolves.toEqual({ status: 'invalid-output' });

    expect(mocks.stream).toHaveBeenCalledOnce();
    expect(mocks.stream).toHaveBeenCalledWith(
      expect.objectContaining({ maxRetries: 0 })
    );
    expect(mocks.settle).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        runId: 'run',
        actualCredits: 2,
        inputTokens: 12,
        outputTokens: 10,
        reasoningTokens: 3,
        status: failure === 'abort' ? 'aborted' : 'failed',
      })
    );
  }
);

test('the existing reservation claim prevents a second provider dispatch', async () => {
  mocks.begin.mockRejectedValueOnce(new Error('duplicate'));
  await expect(
    generateWorldDraft(scope, request, new AbortController().signal)
  ).rejects.toThrow('duplicate');
  expect(mocks.begin).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      idempotencyKey: 'worlds:workspace:actor:world:request',
    })
  );
  expect(mocks.stream).not.toHaveBeenCalled();
  expect(mocks.settle).not.toHaveBeenCalled();
});

test('releases the hold on abort before dispatch', async () => {
  const controller = new AbortController();
  mocks.capacity.mockImplementationOnce(async () => {
    controller.abort();
    return 'ok';
  });
  await expect(
    generateWorldDraft(scope, request, controller.signal)
  ).rejects.toThrow();
  expect(mocks.stream).not.toHaveBeenCalled();
  expect(mocks.settle).toHaveBeenCalledExactlyOnceWith({
    runId: 'run',
    actualCredits: 0,
    status: 'aborted',
  });
});

test('decodes a Gemini SSE response and settles before returning the draft', async () => {
  const { streamText } = await vi.importActual<typeof import('ai')>('ai');
  mocks.stream.mockImplementation(streamText);
  const draft = {
    schemaVersion: 1,
    id: scope.worldId,
    bounds: { width: 80, depth: 60 },
    spawns: [{ x: 0, z: 0, heading: 0 }],
    objects: [],
    assets: [],
  };
  const payload = {
    candidates: [
      {
        index: 0,
        content: { role: 'model', parts: [{ text: JSON.stringify(draft) }] },
        finishReason: 'STOP',
      },
    ],
    usageMetadata: {
      promptTokenCount: 12,
      candidatesTokenCount: 7,
      thoughtsTokenCount: 3,
      totalTokenCount: 22,
    },
  };
  const transport = vi.fn(
    async () =>
      new Response(`data: ${JSON.stringify(payload)}\n\n`, {
        headers: { 'Content-Type': 'text/event-stream' },
      })
  );
  vi.stubGlobal('fetch', transport);

  await expect(
    generateWorldDraft(scope, request, new AbortController().signal)
  ).resolves.toEqual({ status: 'ok', draft });
  expect(transport).toHaveBeenCalledOnce();
  expect(mocks.settle).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      runId: 'run',
      status: 'succeeded',
      inputTokens: 12,
      outputTokens: 10,
      reasoningTokens: 3,
    })
  );
});

test('settles zero credits when the provider dispatch throws', async () => {
  mocks.stream.mockImplementationOnce(() => {
    throw new Error('Provider unavailable');
  });
  await expect(
    generateWorldDraft(scope, request, new AbortController().signal)
  ).rejects.toThrow('Provider unavailable');
  expect(mocks.settle).toHaveBeenCalledExactlyOnceWith({
    runId: 'run',
    actualCredits: 0,
    status: 'failed',
  });
});

test('blocks the provider SDK from opening a continuation request', async () => {
  const { streamText } = await vi.importActual<typeof import('ai')>('ai');
  mocks.stream.mockImplementation(streamText);
  const payload = {
    candidates: [
      { index: 0, finishReason: 'CONTINUATION', continuationToken: 'next' },
    ],
  };
  const transport = vi.fn(
    async () =>
      new Response(`data: ${JSON.stringify(payload)}\n\n`, {
        headers: { 'Content-Type': 'text/event-stream' },
      })
  );
  vi.stubGlobal('fetch', transport);
  await expect(
    generateWorldDraft(scope, request, new AbortController().signal)
  ).rejects.toThrow('Worlds model usage unavailable');
  expect(transport).toHaveBeenCalledOnce();
  expect(mocks.settle).toHaveBeenCalledExactlyOnceWith({
    runId: 'run',
    actualCredits: 0,
    status: 'failed',
  });
});

test('aborts the Gemini HTTP request and settles an unreported attempt', async () => {
  const { streamText } = await vi.importActual<typeof import('ai')>('ai');
  mocks.stream.mockImplementation(streamText);
  const controller = new AbortController();
  const transport = vi.fn(
    async (_url: RequestInfo | URL, options: RequestInit) => {
      controller.abort();
      options.signal?.throwIfAborted();
      throw new Error('Expected the provider request to be aborted');
    }
  );
  vi.stubGlobal('fetch', transport);

  await expect(
    generateWorldDraft(scope, request, controller.signal)
  ).rejects.toThrow();
  expect(transport).toHaveBeenCalledOnce();
  expect(transport.mock.calls[0]?.[1].signal?.aborted).toBe(true);
  expect(mocks.settle).toHaveBeenCalledExactlyOnceWith({
    runId: 'run',
    actualCredits: 0,
    status: 'aborted',
  });
});
