import { beforeEach, describe, expect, it, vi } from 'vitest';

const { upsert } = vi.hoisted(() => ({ upsert: vi.fn() }));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    schema: () => ({ from: () => ({ upsert }) }),
  }),
}));

import { recordAiStudioRunStep } from './metering';

describe('AI Studio step timing persistence', () => {
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
