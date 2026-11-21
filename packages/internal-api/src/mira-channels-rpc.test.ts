import { describe, expect, it, vi } from 'vitest';
import {
  listMiraUsage,
  MiraRpcError,
  miraErrorFromSqlState,
  readBackMiraStop,
  setMiraStopReason,
} from './mira-channels-rpc';

const WS = 'ac000000-0000-4000-8000-0000000000a1';
const CHANNEL = 'ac000000-0000-4000-8000-0000000000c1';

function rpcClient(
  responses: Record<string, { data?: unknown; error?: { code: string } }>
) {
  const rpc = vi.fn(async (fn: string) => ({
    data: responses[fn]?.data ?? null,
    error: responses[fn]?.error ?? null,
  }));
  return { client: { schema: () => ({ rpc }) }, rpc };
}

function tenant(overrides: Record<string, unknown> = {}) {
  return {
    wsId: WS,
    enabled: true,
    keyMode: 'managed',
    preset: 'fast',
    modelId: null,
    neverSilent: true,
    quietHours: null,
    dailyCapMicroUsd: 0,
    monthlyCapMicroUsd: 0,
    stopReasons: ['operator'],
    stopGeneration: 3,
    configVersion: 2,
    persona: null,
    channels: [],
    ...overrides,
  };
}

describe('Mira RPC adapter', () => {
  it('maps SQLSTATE codes to the contract and hides database text', () => {
    expect(miraErrorFromSqlState('40001').status).toBe(409);
    expect(miraErrorFromSqlState('42501').status).toBe(403);
    expect(miraErrorFromSqlState('P0002').status).toBe(404);
    expect(miraErrorFromSqlState('23505').code).toBe('already_bound');
    expect(miraErrorFromSqlState('22023').status).toBe(400);
    expect(miraErrorFromSqlState('XX000').status).toBe(503);
  });

  it('sends the caller reason with its own authority, so a clear removes only that reason', async () => {
    const { client, rpc } = rpcClient({
      mira_set_stop_reason: {
        data: { stopReasons: ['operator'], stopGeneration: 3 },
      },
    });
    const result = await setMiraStopReason(client, {
      wsId: WS,
      channelId: null,
      reason: 'tenant',
      stopped: false,
      actorId: WS,
      expectedGeneration: 2,
      note: null,
    });
    expect(rpc).toHaveBeenCalledWith(
      'mira_set_stop_reason',
      expect.objectContaining({
        p_reason: 'tenant',
        p_authority: 'tenant_manager',
        p_stopped: false,
        p_expected_generation: 2,
      })
    );
    // Another owner's reason stays set and is reported back.
    expect(result.stopReasons).toEqual(['operator']);
  });

  it('surfaces a stale generation as a conflict', async () => {
    const { client } = rpcClient({
      mira_set_stop_reason: { error: { code: '40001' } },
    });
    await expect(
      setMiraStopReason(client, {
        wsId: WS,
        channelId: null,
        reason: 'operator',
        stopped: true,
        actorId: WS,
        expectedGeneration: 1,
        note: 'n',
      })
    ).rejects.toMatchObject({ code: 'conflict', status: 409 });
  });

  it('reads stop state back from the database after a write', async () => {
    const { client } = rpcClient({
      mira_get_tenant: { data: tenant() },
    });
    await expect(
      readBackMiraStop(client, WS, null, {
        stopReasons: [],
        stopGeneration: 3,
      })
    ).resolves.toEqual({ stopReasons: ['operator'], stopGeneration: 3 });
    await expect(
      readBackMiraStop(client, WS, null, {
        stopReasons: [],
        stopGeneration: 4,
      })
    ).rejects.toBeInstanceOf(MiraRpcError);
    await expect(
      readBackMiraStop(client, WS, CHANNEL, {
        stopReasons: [],
        stopGeneration: 1,
      })
    ).rejects.toBeInstanceOf(MiraRpcError);
  });

  it('parses bigint usage columns into numbers', async () => {
    const { client } = rpcClient({
      mira_list_usage: {
        data: [
          {
            channel_id: CHANNEL,
            model_id: 'claude-haiku-5-5',
            day: '2026-11-20',
            replies: '3',
            weighted_replies: 3,
            triaged: 0,
            input_tokens: 10,
            cached_input_tokens: 0,
            output_tokens: 5,
            cost_micro_usd: '1200',
          },
        ],
      },
    });
    const rows = await listMiraUsage(client, {
      wsId: WS,
      from: '2026-11-01',
      to: '2026-11-21',
    });
    expect(rows[0]).toMatchObject({ replies: 3, costMicroUsd: 1200 });
  });
});
