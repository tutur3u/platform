import { describe, expect, it, vi } from 'vitest';
vi.mock('@tuturuuu/email-service', () => ({ sendSystemEmail: vi.fn() }));
import {
  createLiveMintGuard,
  LiveMintCapError,
  readLiveMintConfig,
} from './mint-cap';
const actorId = '00000000-0000-4000-8000-000000000001';
const config = readLiveMintConfig({ LIVE_MINT_KILL_SWITCH: 'false' });
const now = 1_800_000_000_000;
const day = Math.floor((now + 25_200_000) / 86_400_000);
const release = async () => {};

describe('Live mint configuration', () => {
  it('disables minting unless explicitly enabled', () => {
    expect(readLiveMintConfig({}).killSwitch).toBe(true);
    expect(
      readLiveMintConfig({ LIVE_MINT_KILL_SWITCH: 'true' }).killSwitch
    ).toBe(true);
    expect(
      readLiveMintConfig({ LIVE_MINT_KILL_SWITCH: 'false' }).killSwitch
    ).toBe(false);
  });
  it('keeps paid minting on unless the paid stop is explicitly set', () => {
    expect(readLiveMintConfig({}).paidKillSwitch).toBe(false);
    expect(
      readLiveMintConfig({ LIVE_PAID_KILL_SWITCH: 'true' }).paidKillSwitch
    ).toBe(true);
    expect(() => readLiveMintConfig({ LIVE_PAID_KILL_SWITCH: 'yes' })).toThrow(
      LiveMintCapError
    );
  });
  it('uses D310a integer USD defaults and configurable values', () => {
    expect(config).toEqual({
      freeSessionSeconds: 180,
      actorDailyMints: 10,
      dailyBudgetMicroUsd: 50_000_000,
      usdPerMinuteMicroUsd: 36_800,
      killSwitch: false,
      paidKillSwitch: false,
      actorMaxConcurrent: 1,
    });
    expect(
      readLiveMintConfig({
        LIVE_FREE_SESSION_SECONDS: '60',
        LIVE_ACTOR_DAILY_MINTS: '3',
        LIVE_FREE_DAILY_USD_BUDGET: '0.000001',
        LIVE_FREE_USD_PER_MINUTE: '1.234567',
      })
    ).toMatchObject({
      freeSessionSeconds: 60,
      actorDailyMints: 3,
      dailyBudgetMicroUsd: 1,
      usdPerMinuteMicroUsd: 1_234_567,
    });
  });
  it.each([
    { LIVE_FREE_SESSION_SECONDS: '0' },
    { LIVE_FREE_SESSION_SECONDS: '-1' },
    { LIVE_ACTOR_DAILY_MINTS: '1.5' },
    { LIVE_ACTOR_DAILY_MINTS: '1e3' },
    { LIVE_FREE_DAILY_USD_BUDGET: '' },
    { LIVE_FREE_DAILY_USD_BUDGET: '1.0000001' },
    { LIVE_FREE_USD_PER_MINUTE: '0' },
    { LIVE_MINT_KILL_SWITCH: 'FALSE' },
    { LIVE_FREE_SESSION_SECONDS: '3601' },
    { LIVE_ACTOR_DAILY_MINTS: '1001' },
    { LIVE_ACTOR_MAX_CONCURRENT: '101' },
  ])('denies invalid configuration %j', (env) => {
    expect(() => readLiveMintConfig(env)).toThrow(LiveMintCapError);
  });
});
describe('Live mint adapter, store boundary mocked; not Lua atomic proof', () => {
  it('free kill switch leaves paid mints to the store', async () => {
    const getStore = vi.fn(async () => null);
    const guard = createLiveMintGuard({ getStore });
    await expect(
      guard({ actorId, isFree: false, config: { ...config, killSwitch: true } })
    ).rejects.toMatchObject({ code: 'LIVE_MINT_STORE_UNAVAILABLE' });
    expect(getStore).toHaveBeenCalledOnce();
  });
  it('paid kill switch refuses paid mints before the store', async () => {
    const getStore = vi.fn();
    const guard = createLiveMintGuard({ getStore });
    await expect(
      guard({
        actorId,
        isFree: false,
        config: { ...config, paidKillSwitch: true },
      })
    ).rejects.toMatchObject({ status: 503, code: 'LIVE_MINT_DISABLED' });
    expect(getStore).not.toHaveBeenCalled();
  });
  it('kill switch refuses before the store or provider can be called', async () => {
    const getStore = vi.fn();
    const guard = createLiveMintGuard({ getStore });
    await expect(
      guard({ actorId, isFree: true, config: { ...config, killSwitch: true } })
    ).rejects.toMatchObject({ status: 503, code: 'LIVE_MINT_DISABLED' });
    expect(getStore).not.toHaveBeenCalled();
  });
  it.each([null, 'throw', 'malformed'])(
    'fails closed when store is %s',
    async (mode) => {
      const guard = createLiveMintGuard({
        getStore: async () => {
          if (mode === null) return null;
          return {
            release,
            reserve: async () => {
              if (mode === 'throw') throw new Error('unavailable');
              return [1];
            },
          };
        },
      });
      await expect(
        guard({ actorId, isFree: true, config })
      ).rejects.toMatchObject({ status: 503 });
    }
  );
  it('uses store time and releases only the exact reservation', async () => {
    const evaluate = vi
      .fn()
      .mockResolvedValue([
        1,
        now,
        now + 180_000,
        110_400,
        110_400,
        50_000_000,
        0,
        day,
      ]);
    const release = vi.fn().mockResolvedValue(undefined);
    const guard = createLiveMintGuard({
      getStore: async () => ({ reserve: evaluate, release }),
    });
    const admission = await guard({ actorId, isFree: true, config });
    expect(admission.expiresAt).toBe(new Date(now + 180_000).toISOString());
    expect(admission.reservedMicroUsd).toBe(110_400);
    expect(evaluate).toHaveBeenCalledOnce();
    expect(evaluate).toHaveBeenCalledWith({
      actorId,
      mintId: admission.mintId,
      actorLimit: 10,
      concurrentLimit: 1,
      durationMs: 180_000,
      isFree: true,
      budgetLimit: 50_000_000,
      rate: 36_800,
    });
    await admission.release();
    expect(release).toHaveBeenCalledWith({ actorId, mintId: admission.mintId });
  });
  it.each(['actor', 'concurrency'])(
    'returns retryable %s refusal',
    async (reason) => {
      const guard = createLiveMintGuard({
        getStore: async () => ({
          release,
          reserve: async () => [0, reason, 42, 0, 50_000_000, 0, day],
        }),
      });
      await expect(
        guard({ actorId, isFree: true, config })
      ).rejects.toMatchObject({
        status: 429,
        code: `LIVE_MINT_${reason.toUpperCase()}_LIMIT`,
        retryAfter: 42,
      });
    }
  );
  it('alerts at capacity refusal even when spent is below the exact USD ceiling', async () => {
    const alert = vi.fn().mockResolvedValue(undefined);
    const guard = createLiveMintGuard({
      getStore: async () => ({
        release,
        reserve: async () => [0, 'budget', 42, 49_900_800, 50_000_000, 2, day],
      }),
      alert,
    });
    await expect(
      guard({ actorId, isFree: true, config })
    ).rejects.toMatchObject({
      status: 429,
      code: 'FREE_LIVE_DAILY_BUDGET_EXHAUSTED',
    });
    expect(alert).toHaveBeenCalledWith({
      threshold: 100,
      day: new Date(day * 86_400_000).toISOString().slice(0, 10),
      reservedMicroUsd: 49_900_800,
      limitMicroUsd: 50_000_000,
    });
  });
  it('emits aggregate 80 percent event without actors or tokens', async () => {
    const alert = vi.fn().mockResolvedValue(undefined);
    const guard = createLiveMintGuard({
      getStore: async () => ({
        release,
        reserve: async () => [
          1,
          now,
          now + 180_000,
          110_400,
          40_075_200,
          50_000_000,
          1,
          day,
        ],
      }),
      alert,
    });
    await guard({ actorId, isFree: true, config });
    expect(alert).toHaveBeenCalledWith({
      threshold: 80,
      day: new Date(day * 86_400_000).toISOString().slice(0, 10),
      reservedMicroUsd: 40_075_200,
      limitMicroUsd: 50_000_000,
    });
  });
  it('does not undo admission when an alert outcome is unknown', async () => {
    const evaluate = vi
      .fn()
      .mockResolvedValue([
        1,
        now,
        now + 180_000,
        110_400,
        40_075_200,
        50_000_000,
        1,
        day,
      ]);
    const guard = createLiveMintGuard({
      getStore: async () => ({ reserve: evaluate, release }),
      alert: async () => {
        throw new Error('unknown');
      },
    });
    expect(
      (await guard({ actorId, isFree: true, config })).reservedMicroUsd
    ).toBe(110_400);
    expect(evaluate).toHaveBeenCalledOnce();
  });
});
