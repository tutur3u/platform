import { beforeEach, describe, expect, it, vi } from 'vitest';

const { upsert, rpc } = vi.hoisted(() => ({ upsert: vi.fn(), rpc: vi.fn() }));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    schema: () => ({ from: () => ({ upsert }), rpc }),
  }),
}));

import { calculateAiStudioUsageCost, recordAiStudioRunStep } from './metering';

describe('AI Studio step timing persistence', () => {
  it.each([0, 4, 10])(
    'prices total output once with %i reasoning tokens',
    async (reasoningTokens) => {
      rpc.mockResolvedValue({
        data: [{ billed_credits: 1, provider_cost_usd: 0.0001 }],
        error: null,
      });
      await calculateAiStudioUsageCost({
        workspaceId: 'workspace-1',
        modelId: 'openai/gpt-5',
        outputTokens: 10,
        reasoningTokens,
      });
      expect(rpc).toHaveBeenLastCalledWith(
        'calculate_ai_studio_usage_cost',
        expect.objectContaining({
          p_output_tokens: 10 - reasoningTokens,
          p_reasoning_tokens: reasoningTokens,
        })
      );
    }
  );
  beforeEach(() => {
    upsert.mockReset().mockResolvedValue({ error: null });
  });

  it.each([
    [957.426, 957],
    [1.75, 2],
    [0, 0],
    [-1, 0],
    [Number.NaN, null],
    [Number.POSITIVE_INFINITY, null],
    [undefined, null],
    [null, null],
    [3_000_000_000, 2_147_483_647],
  ])('normalizes %s milliseconds to %s', async (latencyMs, expected) => {
    await recordAiStudioRunStep({
      runId: 'test-run',
      sequence: 0,
      kind: 'model',
      name: 'generation',
      status: 'succeeded',
      latencyMs,
      billedCredits: 6.59,
      providerCostUsd: 0.000659,
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        latency_ms: expected,
        billed_credits: 6.59,
        provider_cost_usd: 0.000659,
      }),
      { onConflict: 'run_id,sequence' }
    );
  });
});
