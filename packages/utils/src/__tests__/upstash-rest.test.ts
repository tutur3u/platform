import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fromEnv: vi.fn(),
}));

vi.mock('@upstash/redis', () => ({
  Redis: {
    fromEnv: mocks.fromEnv,
  },
}));

describe('upstash-rest', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    mocks.fromEnv.mockReset();
  });

  it('returns null when Upstash REST env vars are missing', async () => {
    const { getUpstashRestRedisClient, hasUpstashRestEnv } = await import(
      '../upstash-rest.js'
    );

    expect(hasUpstashRestEnv()).toBe(false);
    await expect(getUpstashRestRedisClient()).resolves.toBeNull();
    expect(mocks.fromEnv).not.toHaveBeenCalled();
  });

  it('builds the Redis client from Upstash REST env vars', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    const client = {
      del: vi.fn(),
      eval: vi.fn(),
      evalsha: vi.fn(),
      expire: vi.fn(),
      get: vi.fn(),
      incr: vi.fn(),
      set: vi.fn(),
      ttl: vi.fn(),
    };
    mocks.fromEnv.mockReturnValue(client);

    const {
      getUpstashRatelimitRedisClient,
      getUpstashRestRedisClient,
      hasUpstashRestEnv,
    } = await import('../upstash-rest.js');

    expect(hasUpstashRestEnv()).toBe(true);

    const restClient = await getUpstashRestRedisClient();
    const ratelimitClient = await getUpstashRatelimitRedisClient();

    expect(restClient).not.toBeNull();
    expect(ratelimitClient).not.toBeNull();

    await restClient?.get('rest-key');
    await restClient?.set('rest-key', 'value', { ex: 60 });
    await ratelimitClient?.get('ratelimit-key');
    await ratelimitClient?.set('ratelimit-key', 'value');
    await ratelimitClient?.eval('return 1', ['k'], ['v']);
    await ratelimitClient?.evalsha('sha', ['k'], ['v']);

    expect(client.get).toHaveBeenCalledWith('rest-key');
    expect(client.set).toHaveBeenCalledWith('rest-key', 'value', { ex: 60 });
    expect(client.get).toHaveBeenCalledWith('ratelimit-key');
    expect(client.set).toHaveBeenCalledWith(
      'ratelimit-key',
      'value',
      undefined
    );
    expect(client.eval).toHaveBeenCalledWith('return 1', ['k'], ['v']);
    expect(client.evalsha).toHaveBeenCalledWith('sha', ['k'], ['v']);
    expect(mocks.fromEnv).toHaveBeenCalledTimes(2);
  });
});
