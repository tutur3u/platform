// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { AbuseGuardUnavailableError } from '../client';
import {
  createGuardRedisView,
  GUARD_VIEW_DEFAULT_TTL_MS,
  GuardScanUnsupportedError,
} from '../redis-view';

function fakeClient() {
  const store = new Map<string, string>();
  return {
    store,
    client: {
      family: 'replay' as const,
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      mget: vi.fn(async (keys: string[]) =>
        keys.map((key) => store.get(key) ?? null)
      ),
      set: vi.fn(
        async (
          key: string,
          value: string,
          options: { mode?: 'always' | 'nx' | 'xx' }
        ) => {
          if (options.mode === 'nx' && store.has(key)) return false;
          if (options.mode === 'xx' && !store.has(key)) return false;
          store.set(key, value);
          return true;
        }
      ),
      del: vi.fn(async (keys: string[]) =>
        keys.reduce((count, key) => count + (store.delete(key) ? 1 : 0), 0)
      ),
      incr: vi.fn(async (key: string, by: number) => {
        const n = Number(store.get(key) ?? 0) + by;
        store.set(key, String(n));
        return { n, ttlMs: 1000 };
      }),
      expire: vi.fn(async (key: string) => store.has(key)),
      ttl: vi.fn(async (key: string) => (store.has(key) ? 1500 : -2)),
      hitWindows: vi.fn(),
      reserve: vi.fn(),
      refund: vi.fn(),
    },
  };
}

describe('createGuardRedisView', () => {
  it('keeps Upstash SET NX EX and automatic deserialization semantics', async () => {
    const { client } = fakeClient();
    const redis = createGuardRedisView(client);
    await expect(
      redis.set('refresh:sub:jti', '1700000000', { ex: 60, nx: true })
    ).resolves.toBe('OK');
    expect(client.set).toHaveBeenCalledWith('refresh:sub:jti', '1700000000', {
      ttlMs: 60_000,
      mode: 'nx',
      keepTtl: undefined,
    });
    await expect(
      redis.set('refresh:sub:jti', '1700000001', { ex: 60, nx: true })
    ).resolves.toBeNull();
    // Numeric strings read back as numbers, like Upstash.
    await expect(redis.get('refresh:sub:jti')).resolves.toBe(1700000000);
    await redis.set('json', { verified: true });
    await expect(redis.get('json')).resolves.toEqual({ verified: true });
    await redis.set('text', 'passed', { px: 900_000 });
    await expect(redis.get('text')).resolves.toBe('passed');
    await expect(redis.mget('text', 'missing')).resolves.toEqual([
      'passed',
      null,
    ]);
  });

  it('gives TTL-less writes the default retention', async () => {
    const { client } = fakeClient();
    const redis = createGuardRedisView(client);
    await redis.set('k', 'v');
    expect(client.set).toHaveBeenLastCalledWith('k', 'v', {
      ttlMs: GUARD_VIEW_DEFAULT_TTL_MS,
      mode: 'always',
      keepTtl: undefined,
    });
    await expect(redis.incr('n')).resolves.toBe(1);
    await expect(redis.decr('n')).resolves.toBe(0);
    await expect(redis.expire('n', 30)).resolves.toBe(1);
    await expect(redis.expire('missing', 30)).resolves.toBe(0);
    await expect(redis.ttl('n')).resolves.toBe(2);
    await expect(redis.ttl('missing')).resolves.toBe(-2);
    await expect(redis.del('n', 'missing')).resolves.toBe(1);
  });

  it('propagates store failures and refuses SCAN', async () => {
    const { client } = fakeClient();
    client.get.mockRejectedValueOnce(new AbuseGuardUnavailableError('timeout'));
    const redis = createGuardRedisView(client);
    await expect(redis.get('k')).rejects.toBeInstanceOf(
      AbuseGuardUnavailableError
    );
    await expect(redis.scan()).rejects.toBeInstanceOf(
      GuardScanUnsupportedError
    );
  });
});
