import { describe, expect, it, vi } from 'vitest';
import {
  type MiraProofVerifiers,
  type MiraTenantDeps,
  runMiraTenantAction,
} from './service';

const WS = 'ac000000-0000-4000-8000-0000000000a1';
const CHANNEL = 'ac000000-0000-4000-8000-0000000000c1';
const ACTOR = 'ac000000-0000-4000-8000-000000000001';
const manager = { id: ACTOR, canManage: true, canView: true };
const viewer = { id: ACTOR, canManage: false, canView: true };

function channel(overrides: Record<string, unknown> = {}) {
  return {
    id: CHANNEL,
    kind: 'discord',
    connectionMode: 'shared_bot',
    displayName: 'Guild',
    status: 'live',
    stopReasons: [],
    stopGeneration: 1,
    sendOwner: 'cloud',
    ownerGeneration: 1,
    lastErrorCode: null,
    lastErrorAt: null,
    lastEventAt: null,
    secrets: [],
    ...overrides,
  };
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
    stopReasons: [],
    stopGeneration: 2,
    configVersion: 2,
    persona: null,
    channels: [channel()],
    ...overrides,
  };
}

function deps(
  responses: Record<string, { data?: unknown; error?: { code: string } }>,
  extra: Partial<MiraTenantDeps> = {}
) {
  const rpc = vi.fn(async (fn: string) => ({
    data: responses[fn]?.data ?? null,
    error: responses[fn]?.error ?? null,
  }));
  return {
    rpc,
    deps: {
      rpc: { schema: () => ({ rpc }) },
      verifiers: {},
      purgeSecrets: null,
      today: () => '2026-11-21',
      ...extra,
    } satisfies MiraTenantDeps,
  };
}

describe('Mira tenant actions', () => {
  it('lets viewers read but not write', async () => {
    const { deps: d } = deps({ mira_get_tenant: { data: tenant() } });
    const read = await runMiraTenantAction(d, {
      wsId: WS,
      actor: viewer,
      action: 'get',
    });
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({ canManage: false });

    const write = await runMiraTenantAction(d, {
      wsId: WS,
      actor: viewer,
      action: 'stop',
      body: { stopped: true, expectedGeneration: 2 },
    });
    expect(write).toEqual({ status: 403, body: { error: 'mira_forbidden' } });
  });

  it('stops with the tenant reason only and answers from the readback', async () => {
    const { deps: d, rpc } = deps({
      mira_set_stop_reason: {
        data: { stopReasons: ['tenant'], stopGeneration: 3 },
      },
      mira_get_tenant: {
        data: tenant({
          stopReasons: ['operator', 'tenant'],
          stopGeneration: 3,
        }),
      },
    });
    const result = await runMiraTenantAction(d, {
      wsId: WS,
      actor: manager,
      action: 'stop',
      body: { stopped: true, expectedGeneration: 2 },
    });
    expect(rpc).toHaveBeenCalledWith(
      'mira_set_stop_reason',
      expect.objectContaining({
        p_reason: 'tenant',
        p_authority: 'tenant_manager',
      })
    );
    expect(result).toEqual({
      status: 200,
      body: { stopReasons: ['operator', 'tenant'], stopGeneration: 3 },
    });

    const refused = await runMiraTenantAction(d, {
      wsId: WS,
      actor: manager,
      action: 'stop',
      body: { stopped: false, expectedGeneration: 2, reason: 'operator' },
    });
    expect(refused.status).toBe(400);
  });

  it('returns 409 on a stale stop generation', async () => {
    const { deps: d } = deps({
      mira_set_stop_reason: { error: { code: '40001' } },
    });
    const result = await runMiraTenantAction(d, {
      wsId: WS,
      actor: manager,
      action: 'stop',
      body: { stopped: true, expectedGeneration: 1 },
    });
    expect(result).toEqual({ status: 409, body: { error: 'conflict' } });
  });

  it('reports typed connect errors and never echoes the proof', async () => {
    const proof = { mode: 'bot', token: 'secret-bot-token' };
    const unavailable = await runMiraTenantAction(deps({}).deps, {
      wsId: WS,
      actor: manager,
      action: 'connect',
      channel: 'zalo',
      body: proof,
    });
    expect(unavailable).toEqual({
      status: 503,
      body: { error: 'connect_unavailable' },
    });

    const verifiers: MiraProofVerifiers = {
      zalo: async () => ({ ok: false, error: 'invalid_proof' }),
    };
    const invalid = await runMiraTenantAction(deps({}, { verifiers }).deps, {
      wsId: WS,
      actor: manager,
      action: 'connect',
      channel: 'zalo',
      body: proof,
    });
    expect(invalid).toEqual({ status: 400, body: { error: 'invalid_proof' } });
    expect(JSON.stringify(invalid)).not.toContain('secret-bot-token');

    const personal = await runMiraTenantAction(deps({}, { verifiers }).deps, {
      wsId: WS,
      actor: manager,
      action: 'connect',
      channel: 'zalo',
      body: { mode: 'personal', token: 'secret-bot-token' },
    });
    expect(personal).toEqual({ status: 400, body: { error: 'invalid_proof' } });
  });

  it('binds a verified account and maps a taken account to already_bound', async () => {
    const verifiers: MiraProofVerifiers = {
      zalo: async () => ({
        ok: true,
        mode: 'bot',
        providerAccountId: 'bot-1',
        displayName: 'Bot',
      }),
    };
    const bound = await runMiraTenantAction(
      deps({ mira_bind_channel: { data: CHANNEL } }, { verifiers }).deps,
      {
        wsId: WS,
        actor: manager,
        action: 'connect',
        channel: 'zalo',
        body: { mode: 'bot', token: 't' },
      }
    );
    expect(bound).toEqual({ status: 201, body: { channelId: CHANNEL } });

    const taken = await runMiraTenantAction(
      deps({ mira_bind_channel: { error: { code: '23505' } } }, { verifiers })
        .deps,
      {
        wsId: WS,
        actor: manager,
        action: 'connect',
        channel: 'zalo',
        body: { mode: 'bot', token: 't' },
      }
    );
    expect(taken).toEqual({ status: 409, body: { error: 'already_bound' } });
  });

  it('refuses to unbind past a stop the tenant does not own or unpurged secrets', async () => {
    const operatorStopped = await runMiraTenantAction(
      deps({
        mira_get_tenant: {
          data: tenant({ channels: [channel({ stopReasons: ['operator'] })] }),
        },
      }).deps,
      { wsId: WS, actor: manager, action: 'unbind', channel: CHANNEL }
    );
    expect(operatorStopped.status).toBe(403);

    const tenantSuspended = await runMiraTenantAction(
      deps({
        mira_get_tenant: { data: tenant({ stopReasons: ['operator'] }) },
      }).deps,
      { wsId: WS, actor: manager, action: 'unbind', channel: CHANNEL }
    );
    expect(tenantSuspended.status).toBe(403);

    const withSecrets = await runMiraTenantAction(
      deps({
        mira_get_tenant: {
          data: tenant({
            channels: [
              channel({
                secrets: [{ name: 'bot_token', connectedAt: '2026-11-21' }],
              }),
            ],
          }),
        },
      }).deps,
      { wsId: WS, actor: manager, action: 'unbind', channel: CHANNEL }
    );
    expect(withSecrets).toEqual({
      status: 503,
      body: { error: 'vault_unavailable' },
    });

    const purgeSecrets = vi.fn(async () => {});
    const purged = await runMiraTenantAction(
      deps(
        {
          mira_get_tenant: {
            data: tenant({
              channels: [
                channel({
                  secrets: [{ name: 'bot_token', connectedAt: '2026-11-21' }],
                }),
              ],
            }),
          },
          mira_unbind_channel: { data: true },
        },
        { purgeSecrets }
      ).deps,
      { wsId: WS, actor: manager, action: 'unbind', channel: CHANNEL }
    );
    expect(purgeSecrets).toHaveBeenCalledWith(WS, CHANNEL, ['bot_token']);
    expect(purged).toEqual({ status: 200, body: { unbound: true } });
  });

  it('defaults usage to the last 30 days and bounds the range', async () => {
    const { deps: d, rpc } = deps({ mira_list_usage: { data: [] } });
    const result = await runMiraTenantAction(d, {
      wsId: WS,
      actor: viewer,
      action: 'usage',
      searchParams: new URLSearchParams(),
    });
    expect(result.body).toEqual({
      from: '2026-10-23',
      to: '2026-11-21',
      rows: [],
    });
    expect(rpc).toHaveBeenCalledWith(
      'mira_list_usage',
      expect.objectContaining({ p_from: '2026-10-23', p_to: '2026-11-21' })
    );

    const tooLong = await runMiraTenantAction(d, {
      wsId: WS,
      actor: viewer,
      action: 'usage',
      searchParams: new URLSearchParams({ from: '2025-01-01' }),
    });
    expect(tooLong.status).toBe(400);

    const invalidDate = await runMiraTenantAction(d, {
      wsId: WS,
      actor: viewer,
      action: 'usage',
      searchParams: new URLSearchParams({ to: '2026-13-45' }),
    });
    expect(invalidDate).toEqual({
      status: 400,
      body: { error: 'invalid_range' },
    });
  });
});
