import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  deduct: vi.fn(),
  reasoning: 8 as number | undefined,
}));
vi.mock('@ai-sdk/google', () => ({ google: vi.fn() }));
vi.mock('../memory', () => ({ withAiMemory: vi.fn() }));
vi.mock('../api-key-hash', () => ({ validateApiKeyHash: async () => true }));
vi.mock('@tuturuuu/ai/credits/cap-output-tokens', () => ({
  capMaxOutputTokensByCredits: async () => 100,
}));
vi.mock('@tuturuuu/ai/credits/check-credits', () => ({
  checkAiCredits: async () => ({ allowed: true, remainingCredits: 100 }),
  deductAiCredits: (...args: unknown[]) => mocks.deduct(...args),
}));
vi.mock('@tuturuuu/ai/credits/resolve-plan-model', () => ({
  PlanModelResolutionError: class extends Error {},
  resolvePlanModel: async () => ({ modelId: 'google/gemini-2.5-flash' }),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    from: (table: string) => {
      if (table === 'workspace_api_keys') {
        const query = {
          select: () => query,
          eq: () => query,
          single: async () => ({
            data: {
              id: 'key-1',
              created_by: 'user-1',
              scopes: ['gemini-2.5-flash'],
              key_hash: 'synthetic',
            },
            error: null,
          }),
        };
        return query;
      }
      return { insert: mocks.insert };
    },
    rpc: async () => ({ data: 26000, error: null }),
  }),
}));
vi.mock('ai', () => ({
  streamText: (options: { onFinish: (value: unknown) => Promise<void> }) => ({
    textStream: (async function* () {
      await options.onFinish({
        text: 'Synthetic answer',
        finishReason: 'stop',
        usage: {
          inputTokens: 100,
          outputTokens: 20,
          totalTokens: 120,
          outputTokenDetails: { reasoningTokens: mocks.reasoning },
        },
      });
      yield 'Synthetic answer';
    })(),
  }),
}));

import { createPOST } from './route';

describe('generate output accounting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deduct.mockResolvedValue({ success: true });
    mocks.insert.mockReturnValue({
      select: () => ({
        single: async () => ({
          data: { id: 'execution-1' },
          error: null,
        }),
      }),
    });
  });

  it.each([undefined, 0, 8, 20])(
    'keeps total output in the API and prices %s reasoning tokens once',
    async (reasoning) => {
      mocks.reasoning = reasoning;
      const request = new Request('https://example.test/api/ai/generate', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Synthetic prompt',
          accessKey: { id: 'key-1', value: 'synthetic-key' },
          configs: { wsId: 'workspace-1', model: 'gemini-2.5-flash' },
        }),
      });
      const response = await createPOST()(request as NextRequest);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.usage).toEqual({
        inputTokens: 100,
        outputTokens: 20,
        reasoningTokens: reasoning ?? 0,
        totalTokens: 120,
      });
      expect(body.cost.totalCost).toBe('$0.00008000');
      expect(mocks.deduct).toHaveBeenCalledWith(
        expect.objectContaining({
          outputTokens: 20,
          reasoningTokens: reasoning ?? 0,
        })
      );
      expect(mocks.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          output_tokens: 20 - (reasoning ?? 0),
          reasoning_tokens: reasoning ?? 0,
          total_tokens: 120,
        })
      );
    }
  );
});
