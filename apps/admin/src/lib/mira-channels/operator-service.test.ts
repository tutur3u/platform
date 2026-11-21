import { describe, expect, it, vi } from 'vitest';
import {
  type MiraOperatorDeps,
  runMiraOperatorAction,
} from './operator-service';

const WS = 'ac000000-0000-4000-8000-0000000000a1';
const ACTOR = 'ac000000-0000-4000-8000-000000000001';

function deps(
  responses: Record<string, { data?: unknown; error?: { code: string } }[]>
) {
  const calls: Record<string, number> = {};
  const rpc = vi.fn(async (fn: string) => {
    const index = calls[fn] ?? 0;
    calls[fn] = index + 1;
    const list = responses[fn] ?? [];
    const response = list[Math.min(index, list.length - 1)] ?? {};
    return { data: response.data ?? null, error: response.error ?? null };
  });
  return {
    rpc,
    deps: {
      rpc: { schema: () => ({ rpc }) },
      loadMetrics: async () => ({ status: 'unavailable' as const }),
    } satisfies MiraOperatorDeps,
  };
}

const globalRow = (generation: number, stopped: boolean) => ({
  stopped,
  generation,
  updatedAt: '2026-11-21T06:00:00Z',
  updatedBy: ACTOR,
});

describe('Mira operator actions', () => {
  it('requires a note and an expected generation on tenant stops', async () => {
    const { deps: d, rpc } = deps({});
    const missingNote = await runMiraOperatorAction(d, {
      action: 'tenant_stop',
      actorId: ACTOR,
      wsId: WS,
      body: { stopped: true, expectedGeneration: 2 },
    });
    expect(missingNote.status).toBe(400);
    const longNote = await runMiraOperatorAction(d, {
      action: 'tenant_stop',
      actorId: ACTOR,
      wsId: WS,
      body: { stopped: true, expectedGeneration: 2, note: 'x'.repeat(501) },
    });
    expect(longNote.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('stops with the operator reason and the note, then reads back', async () => {
    const { deps: d, rpc } = deps({
      mira_set_stop_reason: [
        { data: { stopReasons: ['operator', 'tenant'], stopGeneration: 4 } },
      ],
      mira_get_tenant: [
        {
          data: {
            wsId: WS,
            enabled: true,
            keyMode: 'managed',
            preset: 'fast',
            modelId: null,
            neverSilent: true,
            quietHours: null,
            dailyCapMicroUsd: 0,
            monthlyCapMicroUsd: 0,
            stopReasons: ['operator', 'tenant'],
            stopGeneration: 4,
            configVersion: 1,
            persona: null,
            channels: [],
          },
        },
      ],
    });
    const result = await runMiraOperatorAction(d, {
      action: 'tenant_stop',
      actorId: ACTOR,
      wsId: WS,
      body: { stopped: true, expectedGeneration: 3, note: ' abuse report ' },
    });
    expect(rpc).toHaveBeenCalledWith(
      'mira_set_stop_reason',
      expect.objectContaining({
        p_reason: 'operator',
        p_authority: 'operator',
        p_expected_generation: 3,
        p_note: 'abuse report',
      })
    );
    expect(result).toEqual({
      status: 200,
      body: { stopReasons: ['operator', 'tenant'], stopGeneration: 4 },
    });
  });

  it('returns 409 when another operator changed the fence first', async () => {
    const { deps: d } = deps({
      mira_set_global_stop: [{ error: { code: '40001' } }],
    });
    const result = await runMiraOperatorAction(d, {
      action: 'global_stop_set',
      actorId: ACTOR,
      body: { stopped: true, expectedGeneration: 1, note: 'incident' },
    });
    expect(result).toEqual({ status: 409, body: { error: 'conflict' } });
  });

  it('confirms a global stop by readback', async () => {
    const { deps: d } = deps({
      mira_set_global_stop: [{ data: globalRow(2, true) }],
      mira_get_global_stop: [{ data: globalRow(2, true) }],
    });
    const result = await runMiraOperatorAction(d, {
      action: 'global_stop_set',
      actorId: ACTOR,
      body: { stopped: true, expectedGeneration: 1, note: 'incident' },
    });
    expect(result).toEqual({ status: 200, body: globalRow(2, true) });

    const stale = deps({
      mira_set_global_stop: [{ data: globalRow(2, true) }],
      mira_get_global_stop: [{ data: globalRow(1, false) }],
    });
    const failed = await runMiraOperatorAction(stale.deps, {
      action: 'global_stop_set',
      actorId: ACTOR,
      body: { stopped: true, expectedGeneration: 1, note: 'incident' },
    });
    expect(failed.status).toBe(503);
  });

  it('lists tenants in bounded pages with metrics marked unavailable', async () => {
    const row = {
      ws_id: WS,
      enabled: true,
      stop_reasons: [],
      channel_count: 2,
      stopped_channel_count: 0,
      last_error_at: '2026-11-20T00:00:00Z',
      cost_micro_usd_7d: '1500000',
      replies_7d: 12,
    };
    const { deps: d, rpc } = deps({
      mira_operator_overview: [{ data: [row] }],
    });
    const result = await runMiraOperatorAction(d, {
      action: 'tenants',
      actorId: ACTOR,
      searchParams: new URLSearchParams({ limit: '1' }),
    });
    expect(result.body).toEqual({
      tenants: [
        {
          wsId: WS,
          enabled: true,
          stopReasons: [],
          channelCount: 2,
          stoppedChannelCount: 0,
          lastErrorAt: '2026-11-20T00:00:00Z',
          costMicroUsd7d: 1_500_000,
          replies7d: 12,
        },
      ],
      metrics: { status: 'unavailable' },
      nextAfter: WS,
    });
    expect(rpc).toHaveBeenCalledWith('mira_operator_overview', {
      p_after: null,
      p_limit: 1,
    });

    const tooMany = await runMiraOperatorAction(d, {
      action: 'tenants',
      actorId: ACTOR,
      searchParams: new URLSearchParams({ limit: '101' }),
    });
    expect(tooMany.status).toBe(400);
  });
});
