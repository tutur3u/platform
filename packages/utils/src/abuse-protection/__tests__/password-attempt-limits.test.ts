import { describe, expect, it, vi } from 'vitest';
import {
  createPasswordAttemptLimiter,
  getPasswordAttemptKeys,
  normalizePasswordAttemptName,
  PASSWORD_ATTEMPT_LIMITS,
  type PasswordAttemptSubject,
} from '../password-attempt-limits';

// Model atomic Redis execution; the integration test executes the actual Lua.
function fakeRedis() {
  const values = new Map<string, number>();
  const ttls = new Map<string, number>();
  const evaluate = vi.fn(
    async (_script: string, keys: string[], args: number[]) => {
      for (const [i, key] of keys.entries()) {
        if ((values.get(key) ?? 0) >= args[i * 2]!) {
          return [0, ttls.get(key) ?? args[i * 2 + 1]!, 0];
        }
      }
      let remaining = Infinity;
      for (const [i, key] of keys.entries()) {
        const count = (values.get(key) ?? 0) + 1;
        values.set(key, count);
        ttls.set(key, args[i * 2 + 1]!);
        remaining = Math.min(remaining, args[i * 2]! - count);
      }
      return [1, 0, remaining];
    }
  );
  return {
    values,
    client: {
      eval: evaluate,
      // Retained in the fixture to run these regressions against the old helper.
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      incr: vi.fn(async (key: string) => {
        const next = (values.get(key) ?? 0) + 1;
        values.set(key, next);
        return next;
      }),
      expire: vi.fn(async () => 1),
      ttl: vi.fn(async (key: string) => ttls.get(key) ?? -1),
      del: vi.fn(async (key: string) => Number(values.delete(key))),
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

function fixture() {
  const redis = fakeRedis();
  // The generic Redis result is supplied by the atomic fake above.
  const limiter = createPasswordAttemptLimiter(
    async () => redis.client as never
  );
  return { redis, limiter };
}

describe('password attempt limits', () => {
  it('admits exactly the target budget from parallel attempts before any failures', async () => {
    const { limiter } = fixture();
    const results = await Promise.all(
      Array.from({ length: 64 }, (_, i) =>
        limiter.check(subject({ ip: `198.51.100.${i + 1}` }))
      )
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(
      PASSWORD_ATTEMPT_LIMITS.TARGET_FAILED_MAX
    );
    expect(results.find((r) => !r.allowed)).toMatchObject({
      retryAfter: 900,
      remainingAttempts: 0,
    });
  });

  it('admits exactly the IP budget across parallel distinct targets', async () => {
    const { limiter, redis } = fixture();
    const results = await Promise.all(
      Array.from({ length: 64 }, (_, i) =>
        limiter.check(subject({ target: `target-${i}` }))
      )
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(
      PASSWORD_ATTEMPT_LIMITS.IP_FAILED_MAX
    );
    expect(redis.values.size).toBe(PASSWORD_ATTEMPT_LIMITS.IP_FAILED_MAX + 1);
  });

  it('bounds new guest names by the shared plan before allocating target keys', async () => {
    const { limiter, redis } = fixture();
    const attempt = subject({ scope: 'meet-guest-create', target: 'plan-1' });
    const results = await Promise.all(
      Array.from({ length: 64 }, () => limiter.check(attempt))
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(10);
    expect(redis.values.size).toBe(2);
  });

  it('charges success too, so completion cannot reset concurrent reservations', async () => {
    const { limiter } = fixture();
    for (let i = 0; i < 10; i++) {
      expect((await limiter.check(subject())).allowed).toBe(true);
    }
    expect((await limiter.check(subject())).allowed).toBe(false);
    expect(
      (await limiter.check(subject({ target: 'plan-1:bob' }))).allowed
    ).toBe(true);
  });

  it('scopes and hashes keys and shares the unknown IP bucket', () => {
    const meet = getPasswordAttemptKeys(subject());
    expect(meet.target).toMatch(/^pwd:failed:meet-guest:target:[0-9a-f]{32}$/);
    expect(meet.target).not.toContain('ann');
    expect(
      getPasswordAttemptKeys(subject({ scope: 'nova-challenge' })).target
    ).not.toBe(meet.target);
    for (const ip of ['unknown', 'a b;c', null]) {
      expect(getPasswordAttemptKeys(subject({ ip })).ip).toBe(
        'pwd:failed:meet-guest:ip:unknown'
      );
    }
  });

  it('bounds unknown IP attempts across distinct targets', async () => {
    const { limiter } = fixture();
    const results = await Promise.all(
      Array.from({ length: 64 }, (_, i) =>
        limiter.check(subject({ target: `target-${i}`, ip: null }))
      )
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(30);
  });

  it('fails open without Redis or when reservation fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(
        await createPasswordAttemptLimiter(async () => null).check(subject())
      ).toEqual({ allowed: true });
      const { limiter, redis } = fixture();
      redis.client.eval.mockRejectedValue(new Error('down'));
      expect(await limiter.check(subject())).toEqual({ allowed: true });
      expect(warn).toHaveBeenCalledOnce();
    } finally {
      warn.mockRestore();
    }
  });

  it('normalizes guest names for keying', () => {
    expect(normalizePasswordAttemptName('  Ann   Lee ')).toBe('ann lee');
    expect(normalizePasswordAttemptName('ＡＮＮ')).toBe('ann');
  });
});
