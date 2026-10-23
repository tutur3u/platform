import { describe, expect, it, vi } from 'vitest';
import {
  createPasswordAttemptLimiter,
  getPasswordAttemptKeys,
  normalizePasswordAttemptName,
  PASSWORD_ATTEMPT_LIMITS,
  type PasswordAttemptSubject,
} from '../password-attempt-limits';

function fakeRedis() {
  const values = new Map<string, number>();
  const ttls = new Map<string, number>();
  return {
    values,
    ttls,
    client: {
      del: vi.fn(async (...keys: string[]) => {
        for (const key of keys) values.delete(key);
        return keys.length;
      }),
      expire: vi.fn(async (key: string, seconds: number) => {
        ttls.set(key, seconds);
        return 1 as const;
      }),
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      incr: vi.fn(async (key: string) => {
        const next = (values.get(key) ?? 0) + 1;
        values.set(key, next);
        return next;
      }),
      ttl: vi.fn(async (key: string) => ttls.get(key) ?? -1),
    },
  };
}

const subject = (
  overrides: Partial<PasswordAttemptSubject> = {}
): PasswordAttemptSubject => ({
  scope: 'meet-guest',
  target: 'plan-1:ann',
  ip: '203.0.113.7',
  ...overrides,
});

describe('password attempt limits', () => {
  it('blocks a target after the failure budget with a retry window', async () => {
    const redis = fakeRedis();
    const limiter = createPasswordAttemptLimiter(
      async () => redis.client as never
    );

    for (let i = 0; i < PASSWORD_ATTEMPT_LIMITS.TARGET_FAILED_MAX; i++) {
      expect((await limiter.check(subject())).allowed).toBe(true);
      await limiter.recordFailure(subject());
    }

    const blocked = await limiter.check(subject());
    expect(blocked).toMatchObject({ allowed: false, remainingAttempts: 0 });
    expect(blocked.retryAfter).toBe(
      PASSWORD_ATTEMPT_LIMITS.TARGET_WINDOW_MS / 1000
    );
    // Another guest on the same plan keeps its own budget.
    expect(
      (await limiter.check(subject({ target: 'plan-1:bob' }))).allowed
    ).toBe(true);
  });

  it('blocks an IP spraying many targets', async () => {
    const redis = fakeRedis();
    const limiter = createPasswordAttemptLimiter(
      async () => redis.client as never
    );

    for (let i = 0; i < PASSWORD_ATTEMPT_LIMITS.IP_FAILED_MAX; i++) {
      await limiter.recordFailure(subject({ target: `plan-1:guest-${i}` }));
    }

    expect(
      await limiter.check(subject({ target: 'plan-1:fresh' }))
    ).toMatchObject({ allowed: false });
    expect(
      (
        await limiter.check(
          subject({ target: 'plan-1:fresh', ip: '198.51.100.2' })
        )
      ).allowed
    ).toBe(true);
  });

  it('clears the target budget on success but keeps the IP budget', async () => {
    const redis = fakeRedis();
    const limiter = createPasswordAttemptLimiter(
      async () => redis.client as never
    );
    const keys = getPasswordAttemptKeys(subject());

    await limiter.recordFailure(subject());
    await limiter.clear(subject());

    expect(redis.values.has(keys.target)).toBe(false);
    expect(redis.values.get(keys.ip!)).toBe(1);
  });

  it('scopes, hashes and validates keys', () => {
    const meet = getPasswordAttemptKeys(subject());
    const nova = getPasswordAttemptKeys(subject({ scope: 'nova-challenge' }));

    expect(meet.target).toMatch(/^pwd:failed:meet-guest:target:[0-9a-f]{32}$/);
    expect(meet.target).not.toContain('ann');
    expect(nova.target).not.toBe(meet.target);
    expect(getPasswordAttemptKeys(subject({ ip: 'unknown' })).ip).toBeNull();
    expect(getPasswordAttemptKeys(subject({ ip: 'a b;c' })).ip).toBeNull();
    expect(getPasswordAttemptKeys(subject({ ip: null })).ip).toBeNull();
  });

  it('applies only the target budget when the IP is unknown', async () => {
    const redis = fakeRedis();
    const limiter = createPasswordAttemptLimiter(
      async () => redis.client as never
    );

    await limiter.recordFailure(subject({ ip: 'unknown' }));

    expect([...redis.values.keys()]).toEqual([
      getPasswordAttemptKeys(subject()).target,
    ]);
  });

  it('fails open without Redis or when Redis errors', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const missing = createPasswordAttemptLimiter(async () => null);
      expect(await missing.check(subject())).toEqual({ allowed: true });
      await expect(missing.recordFailure(subject())).resolves.toBeUndefined();

      const broken = fakeRedis();
      broken.client.get.mockRejectedValue(new Error('down'));
      broken.client.incr.mockRejectedValue(new Error('down'));
      const failing = createPasswordAttemptLimiter(
        async () => broken.client as never
      );
      expect(await failing.check(subject())).toEqual({ allowed: true });
      await expect(failing.recordFailure(subject())).resolves.toBeUndefined();
    } finally {
      warn.mockRestore();
    }
  });

  it('normalizes guest names for keying', () => {
    expect(normalizePasswordAttemptName('  Ann   Lee ')).toBe('ann lee');
    expect(normalizePasswordAttemptName('ＡＮＮ')).toBe('ann');
  });
});
