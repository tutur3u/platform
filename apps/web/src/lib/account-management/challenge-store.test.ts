import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createChallengeStore } from './challenge-store';
import { canonicalBodyHash, consumeChallenge, issueChallenge } from './policy';

const { getRedis } = vi.hoisted(() => ({ getRedis: vi.fn() }));
vi.mock('@tuturuuu/utils/upstash-rest', () => ({
  getUpstashRatelimitRedisClient: getRedis,
}));

/** Emulates Redis byte storage and command expiry, including Upstash SET serialization. */
function redisEmulator() {
  let now = 0;
  const values = new Map<string, { bytes: string; expires: number }>();
  return {
    advance(seconds: number) {
      now += seconds;
    },
    async set(
      key: string,
      value: unknown,
      options: { nx: boolean; ex: number }
    ) {
      const existing = values.get(key);
      if (options.nx && existing && existing.expires > now) return null;
      values.set(key, {
        bytes: JSON.stringify(value),
        expires: now + options.ex,
      });
      return 'OK';
    },
    async eval(script: string, keys: string[]) {
      if (
        script !== "return redis.call('GETDEL', KEYS[1])" ||
        keys.length !== 1
      ) {
        throw new Error('Unsupported emulator command');
      }
      const key = keys[0];
      if (!key) throw new Error('Missing key');
      const value = values.get(key);
      values.delete(key);
      return value && value.expires > now ? value.bytes : null;
    },
  };
}

const binding = {
  sessionId: '00000000-0000-4000-8000-000000000009',
  actorId: '00000000-0000-4000-8000-000000000001',
  targetId: '00000000-0000-4000-8000-000000000002',
  action: 'admin',
  bodyHash: canonicalBodyHash({ enabled: true }),
} as const;

describe('Redis challenge round trip', () => {
  beforeEach(() => getRedis.mockReset());

  it('issues, consumes serialized bytes, then rejects reuse', async () => {
    getRedis.mockResolvedValue(redisEmulator());
    const store = await createChallengeStore();
    const { nonce } = await issueChallenge(store, binding);
    await expect(
      consumeChallenge(store, nonce, binding)
    ).resolves.toBeUndefined();
    await expect(consumeChallenge(store, nonce, binding)).rejects.toMatchObject(
      { status: 409 }
    );
  });

  it('expires at 120 seconds and burns mismatched bindings', async () => {
    const redis = redisEmulator();
    getRedis.mockResolvedValue(redis);
    const store = await createChallengeStore();
    const expired = await issueChallenge(store, binding);
    redis.advance(120);
    await expect(
      consumeChallenge(store, expired.nonce, binding)
    ).rejects.toMatchObject({ status: 409 });
    const mismatch = await issueChallenge(store, binding);
    await expect(
      consumeChallenge(store, mismatch.nonce, {
        ...binding,
        actorId: binding.targetId,
      })
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      consumeChallenge(store, mismatch.nonce, binding)
    ).rejects.toMatchObject({ status: 409 });
  });

  it('fails closed without Redis', async () => {
    getRedis.mockResolvedValue(null);
    await expect(createChallengeStore()).rejects.toMatchObject({ status: 503 });
  });
});
