import { describe, expect, it, vi } from 'vitest';
import {
  createMFASubjectLimiter,
  getMFASubjectKeys,
  MFA_SUBJECT_LIMITS,
} from '../mfa-subject-limits';

const USER_A = '00000000-0000-4000-8000-00000000000a';
const USER_B = '00000000-0000-4000-8000-00000000000b';
const FACTOR_1 = '00000000-0000-4000-8000-0000000000f1';
const FACTOR_2 = '00000000-0000-4000-8000-0000000000f2';

function createMemoryRedis() {
  const values = new Map<string, number>();
  const ttls = new Map<string, number>();
  return {
    values,
    ttls,
    client: {
      del: vi.fn(async (...keys: string[]) => {
        for (const key of keys) {
          values.delete(key);
          ttls.delete(key);
        }
        return keys.length;
      }),
      expire: vi.fn(async (key: string, seconds: number) => {
        ttls.set(key, seconds);
        return 1;
      }),
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      incr: vi.fn(async (key: string) => {
        const next = (values.get(key) ?? 0) + 1;
        values.set(key, next);
        return next;
      }),
      ttl: vi.fn(async (key: string) => ttls.get(key) ?? -2),
    },
  };
}

function limiterWith(redis: ReturnType<typeof createMemoryRedis>) {
  return createMFASubjectLimiter(async () => redis.client as any);
}

describe('MFA subject limits', () => {
  it('blocks a factor after the per-factor budget regardless of source IP', async () => {
    const redis = createMemoryRedis();
    const limiter = limiterWith(redis);
    const subject = { userId: USER_A, factorId: FACTOR_1 };

    for (let i = 0; i < MFA_SUBJECT_LIMITS.FACTOR_FAILED_MAX - 1; i += 1) {
      await limiter.recordFailure(subject);
    }
    await expect(limiter.check(subject)).resolves.toMatchObject({
      allowed: true,
      remainingAttempts: 1,
    });

    await limiter.recordFailure(subject);
    await expect(limiter.check(subject)).resolves.toMatchObject({
      allowed: false,
      remainingAttempts: 0,
      retryAfter: MFA_SUBJECT_LIMITS.FACTOR_WINDOW_MS / 1000,
    });
  });

  it('caps failures across all factors of one user', async () => {
    const redis = createMemoryRedis();
    const limiter = limiterWith(redis);

    const perFactor = MFA_SUBJECT_LIMITS.FACTOR_FAILED_MAX - 1;
    for (let i = 0; i < perFactor; i += 1) {
      await limiter.recordFailure({ userId: USER_A, factorId: FACTOR_1 });
      await limiter.recordFailure({ userId: USER_A, factorId: FACTOR_2 });
    }
    const third = '00000000-0000-4000-8000-0000000000f3';
    const remaining = MFA_SUBJECT_LIMITS.USER_FAILED_MAX - perFactor * 2;
    for (let i = 0; i < remaining; i += 1) {
      await limiter.recordFailure({ userId: USER_A, factorId: third });
    }

    await expect(
      limiter.check({
        userId: USER_A,
        factorId: '00000000-0000-4000-8000-0000000000f4',
      })
    ).resolves.toMatchObject({
      allowed: false,
      retryAfter: MFA_SUBJECT_LIMITS.USER_WINDOW_MS / 1000,
    });
  });

  it('keeps budgets separate between users', async () => {
    const redis = createMemoryRedis();
    const limiter = limiterWith(redis);

    for (let i = 0; i < MFA_SUBJECT_LIMITS.FACTOR_FAILED_MAX; i += 1) {
      await limiter.recordFailure({ userId: USER_A, factorId: FACTOR_1 });
    }

    await expect(
      limiter.check({ userId: USER_B, factorId: FACTOR_1 })
    ).resolves.toMatchObject({ allowed: true });
  });

  it('resets the budget after a successful code', async () => {
    const redis = createMemoryRedis();
    const limiter = limiterWith(redis);
    const subject = { userId: USER_A, factorId: FACTOR_1 };

    for (let i = 0; i < MFA_SUBJECT_LIMITS.FACTOR_FAILED_MAX; i += 1) {
      await limiter.recordFailure(subject);
    }
    await limiter.clear(subject);

    await expect(limiter.check(subject)).resolves.toMatchObject({
      allowed: true,
      remainingAttempts: MFA_SUBJECT_LIMITS.FACTOR_FAILED_MAX,
    });
  });

  it('collapses malformed identifiers into one bounded key', () => {
    expect(
      getMFASubjectKeys({ userId: USER_A, factorId: 'x:y:*' }).factor
    ).toBe(`mfa:verify:failed:user:${USER_A}:factor:invalid`);
    expect(
      getMFASubjectKeys({ userId: USER_A.toUpperCase(), factorId: FACTOR_1 })
        .user
    ).toBe(`mfa:verify:failed:user:${USER_A}`);
  });

  it('fails open when Redis is unavailable or errors', async () => {
    const unavailable = createMFASubjectLimiter(async () => null);
    await expect(
      unavailable.check({ userId: USER_A, factorId: FACTOR_1 })
    ).resolves.toEqual({ allowed: true });

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failingRedis = {
      del: vi.fn(async () => {
        throw new Error('down');
      }),
      expire: vi.fn(),
      get: vi.fn(async () => {
        throw new Error('down');
      }),
      incr: vi.fn(async () => {
        throw new Error('down');
      }),
      ttl: vi.fn(),
    };
    const failing = createMFASubjectLimiter(async () => failingRedis as any);
    await expect(
      failing.check({ userId: USER_A, factorId: FACTOR_1 })
    ).resolves.toEqual({ allowed: true });
    await expect(
      failing.recordFailure({ userId: USER_A, factorId: FACTOR_1 })
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
