// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AbuseGuardUnavailableError,
  createAbuseGuardClient,
} from '../../abuse-guard/client';
import type { AbuseGuardSelection } from '../../abuse-guard/select';
import {
  createPasswordAttemptLimiter,
  getPasswordAttemptKeys,
  PASSWORD_ATTEMPT_LIMITS,
} from '../password-attempt-limits';

function storeSelection(overrides: Record<string, unknown> = {}) {
  const client = {
    reserve: vi.fn(async () => ({ ok: true, remaining: 7, retryAfterMs: 0 })),
    refund: vi.fn(async () => 1),
    ...overrides,
  };
  const withFairness = vi.fn();
  const scoped = { ...client, withFairness };
  withFairness.mockReturnValue(scoped);
  return {
    client: scoped,
    select: () =>
      ({
        kind: 'durable-object',
        client: scoped,
      }) as unknown as AbuseGuardSelection,
  };
}

const meetGuest = {
  scope: 'meet-guest' as const,
  target: 'plan-1:guest-name',
  ip: '203.0.113.9',
};

afterEach(() => vi.useRealTimers());

describe('password attempts on the abuse-guard store', () => {
  it('reserves source and target budgets atomically in one scope partition', async () => {
    const getRedis = vi.fn();
    const { client, select } = storeSelection();
    const limiter = createPasswordAttemptLimiter(getRedis, select);
    const result = await limiter.check(meetGuest);
    expect(result).toMatchObject({ allowed: true, remainingAttempts: 7 });
    const keys = getPasswordAttemptKeys(meetGuest);
    expect(client.reserve).toHaveBeenCalledWith({
      partition: 'pwd:meet-guest',
      budgets: [
        {
          key: keys.source,
          limit: PASSWORD_ATTEMPT_LIMITS.IP_FAILED_MAX,
          ttlMs: PASSWORD_ATTEMPT_LIMITS.IP_WINDOW_MS,
        },
        {
          key: keys.target,
          limit: PASSWORD_ATTEMPT_LIMITS.TARGET_FAILED_MAX,
          ttlMs: PASSWORD_ATTEMPT_LIMITS.TARGET_WINDOW_MS,
        },
      ],
      receipt: expect.stringMatching(/^pwd:reservation:/u),
    });
    expect(client.withFairness).toHaveBeenCalledWith({ source: '203.0.113.9' });
    expect(getRedis).not.toHaveBeenCalled();

    await result.refund?.();
    const [{ receipt }] = client.reserve.mock.calls[0] as unknown as [
      { receipt: string },
    ];
    expect(client.refund).toHaveBeenCalledWith({
      partition: 'pwd:meet-guest',
      receipt,
      target: keys.target,
    });
  });

  it('uses the per-user budget for Nova challenges', async () => {
    const { client, select } = storeSelection();
    await createPasswordAttemptLimiter(vi.fn(), select).check({
      scope: 'nova-challenge',
      target: 'challenge-1',
      userId: 'user-1',
    });
    expect(client.withFairness).toHaveBeenCalledWith({
      source: 'unknown',
      principal: 'user-1',
    });
    expect(client.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        partition: 'pwd:nova-challenge',
        budgets: [
          expect.objectContaining({ limit: PASSWORD_ATTEMPT_LIMITS.USER_MAX }),
          expect.anything(),
        ],
      })
    );
  });

  it('returns a positive Retry-After in seconds on denial', async () => {
    const { select } = storeSelection({
      reserve: vi.fn(async () => ({
        ok: false,
        remaining: 0,
        retryAfterMs: 61_200,
      })),
    });
    await expect(
      createPasswordAttemptLimiter(vi.fn(), select).check(meetGuest)
    ).resolves.toEqual({
      allowed: false,
      reason: 'Too many failed password attempts',
      retryAfter: 62,
      remainingAttempts: 0,
    });
  });

  it.each([
    new AbuseGuardUnavailableError('timeout'),
    new AbuseGuardUnavailableError('guard_stopped'),
  ])('fails closed when the assigned store throws $code', async (error) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { select } = storeSelection({
      reserve: vi.fn(async () => {
        throw error;
      }),
    });
    await expect(
      createPasswordAttemptLimiter(vi.fn(), select).check(meetGuest)
    ).resolves.toEqual({
      allowed: false,
      reason: 'Password verification temporarily unavailable',
      retryAfter: 30,
      remainingAttempts: 0,
    });
    warn.mockRestore();
  });

  it('fails closed without falling back to Upstash when the store is off', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const getRedis = vi.fn();
    await expect(
      createPasswordAttemptLimiter(getRedis, () => ({ kind: 'off' })).check(
        meetGuest
      )
    ).resolves.toMatchObject({ allowed: false, retryAfter: 30 });
    expect(getRedis).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('keeps the legacy fail-open policy while the family is unassigned', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(
      createPasswordAttemptLimiter(
        async () => null,
        () => ({ kind: 'legacy' })
      ).check(meetGuest)
    ).resolves.toEqual({ allowed: true });
    warn.mockRestore();
  });

  it('fails closed on a malformed reply from a real client', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = createAbuseGuardClient({
      family: 'password',
      pepper: 'p'.repeat(40),
      transport: async () => ({ v: 1, steps: [{ results: [] }] }),
    });
    await expect(
      createPasswordAttemptLimiter(vi.fn(), () => ({
        kind: 'durable-object',
        client,
      })).check(meetGuest)
    ).resolves.toMatchObject({ allowed: false, retryAfter: 30 });
    warn.mockRestore();
  });

  it('fails closed when the reply times out after the store committed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let committed = 0;
    const client = createAbuseGuardClient({
      family: 'password',
      pepper: 'p'.repeat(40),
      transport: async () => {
        // The reservation is spent remotely, but the caller never learns it.
        committed += 1;
        throw new AbuseGuardUnavailableError('timeout');
      },
    });
    const result = await createPasswordAttemptLimiter(vi.fn(), () => ({
      kind: 'durable-object',
      client,
    })).check(meetGuest);
    expect(result).toMatchObject({ allowed: false, retryAfter: 30 });
    // No refund handle: the unknown-outcome attempt stays counted.
    expect('refund' in result).toBe(false);
    expect(committed).toBe(1);
    warn.mockRestore();
  });

  it('a refund failure never throws to the caller', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { select } = storeSelection({
      refund: vi.fn(async () => {
        throw new AbuseGuardUnavailableError('network');
      }),
    });
    const result = await createPasswordAttemptLimiter(vi.fn(), select).check(
      meetGuest
    );
    await expect(result.refund?.()).resolves.toBeUndefined();
    warn.mockRestore();
  });
  it('suppresses repeated denied reserves, expires the shortcut and bounds eviction', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const { client, select } = storeSelection({
      reserve: vi.fn(async () => ({
        ok: false,
        remaining: 0,
        retryAfterMs: 900000,
      })),
    });
    const limiter = createPasswordAttemptLimiter(vi.fn(), select);
    for (let n = 0; n < 100; n++)
      expect((await limiter.check(meetGuest)).allowed).toBe(false);
    expect(client.reserve).toHaveBeenCalledTimes(1);
    // A refund elsewhere may open this target; never cache its denial for the full window.
    vi.advanceTimersByTime(1000);
    await limiter.check(meetGuest);
    expect(client.reserve).toHaveBeenCalledTimes(2);
    for (let n = 0; n < 10000; n++)
      await limiter.check({ ...meetGuest, target: `pressure:${n}` });
    await limiter.check(meetGuest);
    expect(client.reserve).toHaveBeenCalledTimes(10003);
    const restarted = createPasswordAttemptLimiter(vi.fn(), select);
    await restarted.check(meetGuest);
    expect(client.reserve).toHaveBeenCalledTimes(10004);
  });
});
