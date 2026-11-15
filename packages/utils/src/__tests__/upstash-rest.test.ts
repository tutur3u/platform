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
    const { getUpstashRestRedisClient, hasUpstashRestEnv } =
      await import('../upstash-rest.js');

    expect(hasUpstashRestEnv()).toBe(false);
    await expect(getUpstashRestRedisClient()).resolves.toBeNull();
    expect(mocks.fromEnv).not.toHaveBeenCalled();
  });

  it('builds the Redis client from Upstash REST env vars', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    const client = {
      decr: vi.fn(),
      del: vi.fn(),
      eval: vi.fn(),
      evalsha: vi.fn(),
      expire: vi.fn(),
      get: vi.fn(),
      incr: vi.fn(),
      mget: vi.fn(),
      scan: vi.fn(),
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
    await restClient?.eval('return ARGV[1]', ['claim-key'], ['claim-token']);
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
    expect(client.eval).toHaveBeenCalledWith(
      'return ARGV[1]',
      ['claim-key'],
      ['claim-token']
    );
    expect(client.eval).toHaveBeenCalledWith('return 1', ['k'], ['v']);
    expect(client.evalsha).toHaveBeenCalledWith('sha', ['k'], ['v']);
    expect(mocks.fromEnv).toHaveBeenCalledTimes(2);
  });
});

describe('SR-951 missing-store report', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('reports a missing Upstash pair loudly once per production instance', async () => {
    const { hasUpstashRestEnv, resetMissingUpstashEnvReportForTests } =
      await import('../upstash-rest.js');
    resetMissingUpstashEnvReportForTests();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'secret-token-value');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(hasUpstashRestEnv()).toBe(false);
    expect(hasUpstashRestEnv()).toBe(false);

    expect(error).toHaveBeenCalledOnce();
    const [message] = error.mock.calls[0] ?? [];
    expect(message).toContain('[abuse-guard] SR-951');
    // Fixed text only: never a configured value.
    expect(String(message)).not.toContain('secret-token-value');
  });

  it('stays quiet outside production and when the pair is configured', async () => {
    const { hasUpstashRestEnv, resetMissingUpstashEnvReportForTests } =
      await import('../upstash-rest.js');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    resetMissingUpstashEnvReportForTests();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    expect(hasUpstashRestEnv()).toBe(false);

    resetMissingUpstashEnvReportForTests();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    expect(hasUpstashRestEnv()).toBe(true);

    expect(error).not.toHaveBeenCalled();
  });
});
