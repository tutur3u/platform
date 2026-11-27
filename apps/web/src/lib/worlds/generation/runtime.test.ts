import { expect, test, vi } from 'vitest';
import { createTuturuuuWorldsProvider } from './runtime';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(() => ({})),
  plan: vi.fn(async () => ({ modelId: 'google/gemini-3.1-flash-lite' })),
  settle: vi.fn(async () => ({ success: true })),
  stream: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@ai-sdk/google', () => ({ google: vi.fn() }));
vi.mock('ai', () => ({ streamText: mocks.stream }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/ai/credits/resolve-plan-model', () => ({
  resolvePlanModel: mocks.plan,
}));
vi.mock('@tuturuuu/ai/credits/nested-budget', () => ({
  reserveNestedModelBudget: async () => ({
    ok: true,
    reservationId: 'hold',
    perAttemptMaxOutputTokens: 1024,
  }),
}));
vi.mock('@tuturuuu/ai/credits/reservations', () => ({
  settleMeteredAiCreditReservation: mocks.settle,
}));

test.each(['overflow', 'error'])(
  'settles reported usage on %s',
  async (failure) => {
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
      })(),
    });
    const scope = {
      workspaceId: 'workspace',
      worldId: 'world',
      actorId: 'actor',
    };
    const ledger = {
      claim: async () => true,
      recordReservation: async () => {},
      recordUsage: vi.fn(async () => {}),
    };
    const provider = createTuturuuuWorldsProvider(scope, ledger);

    expect(
      await provider.generate({
        attempt: 1,
        signal: new AbortController().signal,
        request: {
          workspaceId: scope.workspaceId,
          worldId: scope.worldId,
          requestId: 'request',
          kind: 'prompt',
          instruction: 'Add a stage',
        },
      })
    ).toEqual({ kind: 'draft', draft: null });
    expect(mocks.plan).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedModel: 'google/gemini-3.1-flash-lite',
      })
    );
    expect(mocks.admin).toHaveBeenCalledWith({ noCookie: true });
    expect(ledger.recordUsage).toHaveBeenCalledWith(expect.anything(), 'hold', {
      inputTokens: 12,
      outputTokens: 10,
      reasoningTokens: 3,
    });
    expect(mocks.settle).toHaveBeenCalledWith(
      'hold',
      expect.objectContaining({
        inputTokens: 12,
        outputTokens: 7,
        reasoningTokens: 3,
      })
    );
  }
);
