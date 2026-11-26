import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  gateway: vi.fn(),
  generate: vi.fn(),
  google: vi.fn(),
  release: vi.fn(),
  reserveNestedModelBudget: vi.fn(),
  resolvePlanModel: vi.fn(),
  settle: vi.fn(),
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

vi.mock('../../credits/nested-budget', () => ({
  reserveNestedModelBudget: (
    ...args: Parameters<typeof mocks.reserveNestedModelBudget>
  ) => mocks.reserveNestedModelBudget(...args),
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
    mocks.settle.mockResolvedValue(undefined);
    mocks.release.mockResolvedValue(undefined);
    mocks.reserveNestedModelBudget.mockResolvedValue({
      ok: true,
      reservationId: 'pc-res-1',
      heldCredits: 10,
      perAttemptMaxOutputTokens: 40,
      settle: mocks.settle,
      release: mocks.release,
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

  it('meters parallel check subagents against a held budget for the billed workspace', async () => {
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
    expect(mocks.resolvePlanModel).toHaveBeenCalledWith({
      capability: 'language',
      requestedModel: 'gemini-3.1-flash-lite',
      wsId: 'billing-workspace',
    });
    expect(mocks.reserveNestedModelBudget).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptCount: 2,
        modelId: 'google/gemini-3.1-flash-lite',
        userId: 'user-1',
        wsId: 'billing-workspace',
      })
    );
    expect(mocks.toolLoopAgent).toHaveBeenCalledWith(
      expect.objectContaining({ maxOutputTokens: 40 })
    );
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    expect(mocks.settle).toHaveBeenCalledWith({
      inputTokens: 22,
      outputTokens: 14,
      reasoningTokens: 4,
    });
  });

  it('fails closed with a fixed message when budget verification or model allowance fails', async () => {
    mocks.reserveNestedModelBudget.mockResolvedValueOnce({
      ok: false,
      code: 'CREDIT_CHECK_FAILED',
      status: 503,
    });

    expect(
      await executeParallelChecks(
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
      )
    ).toEqual({
      ok: false,
      error: 'AI request budget could not be verified for parallel checks.',
    });

    mocks.reserveNestedModelBudget.mockResolvedValueOnce({
      ok: false,
      code: 'MODEL_NOT_ALLOWED',
      status: 403,
    });

    expect(
      await executeParallelChecks(
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
      )
    ).toEqual({
      ok: false,
      error: 'The parallel-checks model is not enabled for your workspace.',
    });
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
