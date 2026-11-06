import {
  calculateAiStudioUsageCost,
  settleAiStudioRun,
} from '@tuturuuu/ai/studio/metering';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { MeteredExecutionContext } from './public-api';
import {
  RECONCILIATION_IO_BUDGET_MS,
  runBudgetedSettlement,
  SETTLEMENT_IO_BUDGET_MS,
  SettlementReconciliationError,
} from './settlement-io';

const paramsSchema = z
  .object({
    p_ws_id: z.string().optional(),
    p_run_id: z.string().optional(),
    run_id: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();
function context(id: string): MeteredExecutionContext {
  return {
    runId: `run-${id}`,
    requestId: `request-${id}`,
    modelId: 'fixture-model',
    startedAt: Date.now(),
    credential: {
      kind: 'first-party',
      appId: 'colab',
      actorId: `actor-${id}`,
      workspaceId: `workspace-${id}`,
    },
  };
}
const usage = { inputTokens: 13, outputTokens: 7 };

function fixture(phase: 'pricing' | 'settlement', stallJournal = false) {
  const calls: Array<{
    path: string;
    signal: AbortSignal;
    params: z.infer<typeof paramsSchema>;
  }> = [];
  const aborted: string[] = [];
  const fetcher: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const body: unknown = await request.json();
    const params = paramsSchema.parse(body);
    const signal = init?.signal;
    if (!signal) throw new Error('Every RPC must have a scoped abort signal');
    const path = new URL(request.url).pathname;
    calls.push({ path, signal, params });
    const stall =
      (phase === 'pricing' &&
        path.endsWith('/calculate_ai_studio_usage_cost') &&
        params.p_ws_id === 'workspace-a') ||
      (phase === 'settlement' &&
        path.endsWith('/settle_ai_studio_run') &&
        params.p_run_id === 'run-a') ||
      (stallJournal && path.endsWith('/ai_studio_run_steps'));
    if (stall)
      return new Promise<Response>((_, reject) => {
        const abort = () => {
          aborted.push(path);
          reject(signal.reason);
        };
        if (signal.aborted) abort();
        else signal.addEventListener('abort', abort, { once: true });
      });
    if (path.endsWith('/calculate_ai_studio_usage_cost'))
      return Response.json([{ billed_credits: 2, provider_cost_usd: 0.001 }]);
    if (path.endsWith('/settle_ai_studio_run'))
      return Response.json([{ success: true }]);
    if (path.endsWith('/ai_studio_run_steps')) return Response.json([]);
    throw new Error(`Unexpected RPC path ${path}`);
  };
  const execute = (ctx: MeteredExecutionContext) =>
    runBudgetedSettlement(
      ctx,
      { usage, status: 'aborted' },
      async (io, phase) => {
        const cost = await calculateAiStudioUsageCost(
          {
            workspaceId: ctx.credential.workspaceId,
            modelId: ctx.modelId,
            ...usage,
          },
          io
        );
        phase('settlement');
        await settleAiStudioRun(
          {
            runId: ctx.runId,
            status: 'aborted',
            actualCredits: cost.billedCredits,
            ...usage,
          },
          io
        );
        return cost;
      },
      fetcher
    );
  return { calls, aborted, execute };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv(
    'SUPABASE_SERVER_URL',
    'https://settlement-fixture.supabase.invalid'
  );
  vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_local_settlement_fixture');
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const phases: Array<'pricing' | 'settlement'> = ['pricing', 'settlement'];

describe('bounded isolated settlement RPC transport', () => {
  it.each(phases)(
    'aborts stalled %s, journals the original identity and isolates a concurrent request',
    async (phase) => {
      const io = fixture(phase);
      const a = context('a');
      const b = context('b');
      const failed = io.execute(a).catch((error: unknown) => error);
      const normal = io.execute(b);
      await vi.advanceTimersByTimeAsync(10);
      await expect(normal).resolves.toEqual({
        billedCredits: 2,
        providerCostUsd: 0.001,
      });
      await vi.advanceTimersByTimeAsync(SETTLEMENT_IO_BUDGET_MS);
      const error = await failed;
      if (!(error instanceof SettlementReconciliationError))
        throw new Error('Expected a reconciliation outcome');
      expect(error.outcome).toMatchObject({
        phase,
        completion: 'unknown',
        runId: 'run-a',
        requestId: 'request-a',
        actorId: 'actor-a',
        workspaceId: 'workspace-a',
        usage,
        recording: 'confirmed',
      });
      expect(io.aborted).toContain(
        `/rest/v1/rpc/${phase === 'pricing' ? 'calculate_ai_studio_usage_cost' : 'settle_ai_studio_run'}`
      );
      const journal = io.calls.filter((call) =>
        call.path.endsWith('/ai_studio_run_steps')
      );
      expect(journal).toHaveLength(1);
      expect(journal[0]?.params).toMatchObject({
        run_id: 'run-a',
        metadata: {
          run_id: 'run-a',
          request_id: 'request-a',
          actor_id: 'actor-a',
          workspace_id: 'workspace-a',
          completion: 'unknown',
          reconciliation_required: true,
          usage,
        },
      });
      const bCalls = io.calls.filter(
        (call) =>
          call.params.p_ws_id === 'workspace-b' ||
          call.params.p_run_id === 'run-b'
      );
      expect(bCalls).toHaveLength(2);
      expect(bCalls.every((call) => !call.signal.aborted)).toBe(true);
      expect(
        io.calls.filter((call) => call.params.p_run_id === 'run-a')
      ).toHaveLength(phase === 'pricing' ? 0 : 1);
      const beforeRetry = io.calls.length;
      await expect(io.execute(a)).rejects.toBeInstanceOf(
        SettlementReconciliationError
      );
      expect(io.calls).toHaveLength(beforeRetry);
    }
  );
  it('bounds the reconciliation write separately and records an unknown acknowledgement', async () => {
    const io = fixture('pricing', true);
    const failed = io.execute(context('a')).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(
      SETTLEMENT_IO_BUDGET_MS + RECONCILIATION_IO_BUDGET_MS + 10
    );
    const error = await failed;
    if (!(error instanceof SettlementReconciliationError))
      throw new Error('Expected a reconciliation outcome');
    expect(error.outcome.recording).toBe('unknown');
    expect(io.aborted).toContain('/rest/v1/ai_studio_run_steps');
    expect(
      io.calls.filter((call) => call.path.endsWith('/settle_ai_studio_run'))
    ).toHaveLength(0);
  });
  it('starts no I/O when the post-disconnect grace is already exhausted', async () => {
    const io = fixture('pricing');
    const a = context('a');
    a.disconnectedAt = Date.now() - 30_000;
    await expect(io.execute(a)).rejects.toBeInstanceOf(
      SettlementReconciliationError
    );
    expect(io.calls).toHaveLength(0);
  });
});
