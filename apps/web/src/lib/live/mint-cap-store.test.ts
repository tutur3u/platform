import { AbuseGuardUnavailableError } from '@tuturuuu/utils/abuse-guard/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const selectAbuseGuard = vi.fn();
const getUpstash = vi.fn();
vi.mock('@tuturuuu/email-service', () => ({ sendSystemEmail: vi.fn() }));
vi.mock('@tuturuuu/utils/abuse-guard/select', () => ({
  selectAbuseGuard: (...args: unknown[]) => selectAbuseGuard(...args),
}));
vi.mock('@tuturuuu/utils/upstash-rest', () => ({
  getUpstashRatelimitRedisClient: () => getUpstash(),
}));

import { createLiveMintGuard, readLiveMintConfig } from './mint-cap';
import {
  createGuardLiveMintStore,
  getLiveMintStore,
  LIVE_MINT_GUARD_PARTITION,
} from './mint-cap-store';

const actorId = '00000000-0000-4000-8000-000000000001';
const config = readLiveMintConfig({ LIVE_MINT_KILL_SWITCH: 'false' });
const now = 1_800_000_000_000;
const day = Math.floor((now + 25_200_000) / 86_400_000);
const granted = {
  op: 'live.reserve' as const,
  ok: true as const,
  at: now,
  expiresAt: now + 180_000,
  reserved: 110_400,
  spent: 110_400,
  limit: 50_000_000,
  alert: 0,
  day,
};

beforeEach(() => {
  selectAbuseGuard.mockReset();
  getUpstash.mockReset();
});

describe('Live mint store selection', () => {
  it('uses the Durable Object store when the live family is assigned', async () => {
    const liveReserve = vi.fn().mockResolvedValue(granted);
    selectAbuseGuard.mockReturnValue({
      kind: 'durable-object',
      client: { liveReserve },
    });
    const guard = createLiveMintGuard({ alert: vi.fn() });
    const admission = await guard({ actorId, isFree: true, config });
    expect(selectAbuseGuard).toHaveBeenCalledWith('live');
    expect(getUpstash).not.toHaveBeenCalled();
    expect(liveReserve).toHaveBeenCalledWith({
      partition: LIVE_MINT_GUARD_PARTITION,
      // The mint id is the operation id: a duplicate never charges twice.
      operationId: admission.mintId,
      actor: actorId,
      budget: 'free-budget',
      actorLimit: 10,
      concurrentLimit: 1,
      durationMs: 180_000,
      free: true,
      limit: 50_000_000,
      rate: 36_800,
    });
    expect(admission.expiresAt).toBe(new Date(now + 180_000).toISOString());
    expect(admission.reservedMicroUsd).toBe(110_400);
  });

  it('never falls back to Upstash when an assigned family is off', async () => {
    selectAbuseGuard.mockReturnValue({ kind: 'off' });
    expect(await getLiveMintStore()).toBeNull();
    expect(getUpstash).not.toHaveBeenCalled();
    const guard = createLiveMintGuard();
    await expect(
      guard({ actorId, isFree: false, config })
    ).rejects.toMatchObject({
      status: 503,
      code: 'LIVE_MINT_STORE_UNAVAILABLE',
    });
  });

  it('keeps the legacy Upstash path only for an unassigned family', async () => {
    selectAbuseGuard.mockReturnValue({ kind: 'legacy' });
    getUpstash.mockResolvedValue(null);
    expect(await getLiveMintStore()).toBeNull();
    const evaluate = vi.fn();
    getUpstash.mockResolvedValue({ eval: evaluate });
    expect(await getLiveMintStore()).not.toBeNull();
  });
});

describe('Durable Object store failures fail closed for every tier', () => {
  it.each([
    'guard_stopped',
    'guard_limited',
    'timeout',
    'unauthorized',
  ] as const)('maps %s to 503 without logging identities', async (code) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const guard = createLiveMintGuard({
      getStore: async () =>
        createGuardLiveMintStore({
          liveReserve: async () => {
            throw new AbuseGuardUnavailableError(code);
          },
        }),
    });
    for (const isFree of [true, false]) {
      await expect(guard({ actorId, isFree, config })).rejects.toMatchObject({
        status: 503,
        code: 'LIVE_MINT_STORE_UNAVAILABLE',
      });
    }
    expect(error).toHaveBeenCalledWith('live_mint_store_unavailable', {
      code,
    });
    expect(JSON.stringify(error.mock.calls)).not.toContain(actorId);
    error.mockRestore();
  });

  it('rejects a decision outside the schema', async () => {
    const guard = createLiveMintGuard({
      getStore: async () =>
        createGuardLiveMintStore({
          liveReserve: async () => ({ ...granted, limit: 0 }),
        }),
    });
    await expect(
      guard({ actorId, isFree: true, config })
    ).rejects.toMatchObject({ status: 503, code: 'LIVE_MINT_STORE_INVALID' });
  });

  it('maps a budget denial to the FREE exhaustion refusal and alert', async () => {
    const alert = vi.fn().mockResolvedValue(undefined);
    const guard = createLiveMintGuard({
      alert,
      getStore: async () =>
        createGuardLiveMintStore({
          liveReserve: async () => ({
            op: 'live.reserve',
            ok: false,
            reason: 'budget',
            retryAfterS: 42,
            spent: 49_990_000,
            limit: 50_000_000,
            alert: 2,
            day,
          }),
        }),
    });
    await expect(
      guard({ actorId, isFree: true, config })
    ).rejects.toMatchObject({
      status: 429,
      code: 'FREE_LIVE_DAILY_BUDGET_EXHAUSTED',
      retryAfter: 42,
    });
    expect(alert).toHaveBeenCalledWith(
      expect.objectContaining({ threshold: 100 })
    );
  });

  it('kill switch refuses before the guard is selected', async () => {
    const guard = createLiveMintGuard();
    await expect(
      guard({ actorId, isFree: true, config: { ...config, killSwitch: true } })
    ).rejects.toMatchObject({ status: 503, code: 'LIVE_MINT_DISABLED' });
    expect(selectAbuseGuard).not.toHaveBeenCalled();
  });
});
