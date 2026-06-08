import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  capMaxOutputTokensByCredits: vi.fn(),
  checkAiCredits: vi.fn(),
  createAdminClient: vi.fn(),
  deductAiCredits: vi.fn(),
  gateway: vi.fn(),
  generate: vi.fn(),
  google: vi.fn(),
  resolvePlanModel: vi.fn(),
  stepCountIs: vi.fn(),
  toolLoopAgent: vi.fn(),
  withAiMemory: vi.fn(),
}));

vi.mock('@ai-sdk/google', () => ({
  google: (...args: Parameters<typeof mocks.google>) => mocks.google(...args),
}));

vi.mock('ai', () => ({
  gateway: (...args: Parameters<typeof mocks.gateway>) =>
    mocks.gateway(...args),
  stepCountIs: (...args: Parameters<typeof mocks.stepCountIs>) =>
    mocks.stepCountIs(...args),
  ToolLoopAgent: class {
    private readonly settings: unknown;

    constructor(settings: unknown) {
      this.settings = settings;
      mocks.toolLoopAgent(settings);
    }

    generate(options: unknown) {
      return mocks.generate(options, this.settings);
    }
  },
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
}));

vi.mock('../../credits/cap-output-tokens', () => ({
  capMaxOutputTokensByCredits: (
    ...args: Parameters<typeof mocks.capMaxOutputTokensByCredits>
  ) => mocks.capMaxOutputTokensByCredits(...args),
}));

vi.mock('../../credits/check-credits', () => ({
  checkAiCredits: (...args: Parameters<typeof mocks.checkAiCredits>) =>
    mocks.checkAiCredits(...args),
  deductAiCredits: (...args: Parameters<typeof mocks.deductAiCredits>) =>
    mocks.deductAiCredits(...args),
}));

vi.mock('../../credits/resolve-plan-model', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../credits/resolve-plan-model')>();

  return {
    ...actual,
    resolvePlanModel: (...args: Parameters<typeof mocks.resolvePlanModel>) =>
      mocks.resolvePlanModel(...args),
  };
});

vi.mock('../../memory', () => ({
  withAiMemory: (...args: Parameters<typeof mocks.withAiMemory>) =>
    mocks.withAiMemory(...args),
}));

import { executeParallelChecks } from './parallel-checks';

describe('executeParallelChecks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue({ admin: true });
    mocks.resolvePlanModel.mockResolvedValue({
      allocationId: 'allocation-1',
      modelId: 'google/gemini-3.1-flash-lite',
      source: 'requested',
      tier: 'PRO',
    });
    mocks.checkAiCredits.mockResolvedValue({
      allowed: true,
      errorCode: null,
      errorMessage: null,
      maxOutputTokens: 80,
      remainingCredits: 500,
      tier: 'PRO',
    });
    mocks.capMaxOutputTokensByCredits.mockResolvedValue(80);
    mocks.deductAiCredits.mockResolvedValue({
      creditsDeducted: 1,
      errorCode: null,
      remainingCredits: 499,
      success: true,
    });
    mocks.google.mockImplementation((modelId: string) => ({
      modelId,
      provider: 'google',
    }));
    mocks.gateway.mockImplementation((modelId: string) => ({
      modelId,
      provider: 'gateway',
    }));
    mocks.stepCountIs.mockReturnValue('stop-after-two-steps');
    mocks.withAiMemory.mockImplementation(async (input) => ({
      model: input.model,
      memory: {
        source: input.source,
        wsId: input.wsId,
      },
    }));
    mocks.generate.mockImplementation(async (options) => ({
      text: `Finding for ${(options as { prompt: string }).prompt.slice(0, 24)}`,
      totalUsage: {
        inputTokens: 11,
        inputTokenDetails: {},
        outputTokens: 7,
        outputTokenDetails: { reasoningTokens: 2 },
        totalTokens: 18,
      },
      usage: {
        inputTokens: 11,
        inputTokenDetails: {},
        outputTokens: 7,
        outputTokenDetails: { reasoningTokens: 2 },
        totalTokens: 18,
      },
    }));
  });

  it('meters parallel check subagents against the billed workspace', async () => {
    const result = await executeParallelChecks(
      {
        checks: ['assumptions', 'risk'],
        context: 'Current implementation context',
        question: 'Should we ship this change?',
      },
      {
        chatId: 'chat-1',
        creditWsId: 'billing-workspace',
        supabase: {} as never,
        userId: 'user-1',
        workspaceContext: { wsId: 'context-workspace' } as never,
        wsId: 'route-workspace',
      }
    );

    expect(result).toMatchObject({
      ok: true,
      summary: 'Parallel checks found 2 perspective(s) with material notes.',
    });
    expect((result as { checks: Array<unknown> }).checks).toEqual([
      {
        finding: expect.stringContaining('Review this request'),
        label: 'assumptions',
      },
      {
        finding: expect.stringContaining('Review this request'),
        label: 'risk',
      },
    ]);
    expect(mocks.resolvePlanModel).toHaveBeenCalledWith({
      capability: 'language',
      requestedModel: 'gemini-3.1-flash-lite',
      wsId: 'billing-workspace',
    });
    expect(mocks.checkAiCredits).toHaveBeenCalledWith(
      'billing-workspace',
      'google/gemini-3.1-flash-lite',
      'chat',
      { userId: 'user-1' }
    );
    expect(mocks.capMaxOutputTokensByCredits).toHaveBeenCalledWith(
      { admin: true },
      'google/gemini-3.1-flash-lite',
      80,
      500
    );
    expect(mocks.google).toHaveBeenCalledWith('gemini-3.1-flash-lite');
    expect(mocks.gateway).not.toHaveBeenCalled();
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({ maxOutputTokens: 40 }),
      expect.any(Object)
    );
    expect(mocks.withAiMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        product: 'mira',
        source: 'mira_parallel_checks_tool',
        userId: 'user-1',
        wsId: 'context-workspace',
      })
    );
    expect(mocks.deductAiCredits).toHaveBeenCalledTimes(2);
    expect(mocks.deductAiCredits).toHaveBeenCalledWith({
      wsId: 'billing-workspace',
      userId: 'user-1',
      modelId: 'google/gemini-3.1-flash-lite',
      inputTokens: 11,
      outputTokens: 7,
      reasoningTokens: 2,
      feature: 'chat',
      metadata: {
        source: 'mira_parallel_checks_tool',
        check: 'assumptions',
        chatId: 'chat-1',
        creditWsId: 'billing-workspace',
        routeWsId: 'route-workspace',
        workspaceContextWsId: 'context-workspace',
      },
    });
  });

  it('does not spawn subagents when the credit check rejects the model', async () => {
    mocks.checkAiCredits.mockResolvedValueOnce({
      allowed: false,
      errorCode: 'MODEL_NOT_ALLOWED',
      errorMessage: 'Model blocked for workspace.',
      maxOutputTokens: null,
      remainingCredits: 0,
      tier: 'FREE',
    });

    const result = await executeParallelChecks(
      {
        checks: ['assumptions'],
        question: 'Should we ship this change?',
      },
      {
        creditWsId: 'billing-workspace',
        supabase: {} as never,
        userId: 'user-1',
        wsId: 'route-workspace',
      }
    );

    expect(result).toEqual({
      ok: false,
      error: 'Model blocked for workspace.',
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.toolLoopAgent).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.deductAiCredits).not.toHaveBeenCalled();
  });
});
