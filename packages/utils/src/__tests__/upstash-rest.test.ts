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

describe('SR-951 legacy-family store report', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('pages once per family when a family resolves to legacy without the pair', async () => {
    const {
      getUpstashRestRedisClient,
      reportLegacyFamilyWithoutStore,
      resetLegacyFamilyReportsForTests,
    } = await import('../upstash-rest.js');
    resetLegacyFamilyReportsForTests();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'secret-token-value');
    vi.stubEnv('ABUSE_GUARD_BACKEND', '');
    vi.stubEnv('ABUSE_GUARD_FAMILIES', '');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      getUpstashRestRedisClient({ family: 'replay' })
    ).resolves.toBeNull();
    await expect(
      getUpstashRestRedisClient({ family: 'replay' })
    ).resolves.toBeNull();
    reportLegacyFamilyWithoutStore('password');

    expect(error).toHaveBeenCalledTimes(2);
    const messages = error.mock.calls.map(([message]) => String(message));
    expect(messages[0]).toMatch(/^\[ALERT\]\[abuse-guard\] SR-951 /);
    const payload = JSON.parse(messages[0]!.replace(/^[^{]*/, ''));
    expect(payload).toMatchObject({
      alert: 'abuse-guard-store-missing',
      family: 'replay',
      reason: 'legacy-without-pair',
      severity: 'critical',
    });
    expect(Object.keys(payload).sort()).toEqual(
      ['alert', 'app', 'family', 'reason', 'severity'].sort()
    );
    expect(messages.join('\n')).not.toContain('secret-token-value');
  });

  it('stays quiet for plain env checks, outside production and with the pair', async () => {
    const {
      getUpstashRestRedisClient,
      hasUpstashRestEnv,
      resetLegacyFamilyReportsForTests,
    } = await import('../upstash-rest.js');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Per-app rate limiters call hasUpstashRestEnv() directly: never alert.
    resetLegacyFamilyReportsForTests();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    expect(hasUpstashRestEnv()).toBe(false);
    await expect(getUpstashRestRedisClient()).resolves.toBeNull();

    resetLegacyFamilyReportsForTests();
    vi.stubEnv('NODE_ENV', 'test');
    await expect(
      getUpstashRestRedisClient({ family: 'replay' })
    ).resolves.toBeNull();

    expect(error).not.toHaveBeenCalled();
  });

  it('alerts with a fixed reason when an assigned family is switched off or invalid', async () => {
    const { getUpstashRestRedisClient, resetLegacyFamilyReportsForTests } =
      await import('../upstash-rest.js');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    resetLegacyFamilyReportsForTests();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ABUSE_GUARD_FAMILIES', 'replay');
    vi.stubEnv('ABUSE_GUARD_URL', 'https://guard.fixture.invalid');
    vi.stubEnv('ABUSE_GUARD_SECRET', 'short-secret-value');
    vi.stubEnv('ABUSE_GUARD_KEY_PEPPER', 'p'.repeat(32));

    vi.stubEnv('ABUSE_GUARD_BACKEND', '');
    await expect(
      getUpstashRestRedisClient({ family: 'replay' })
    ).resolves.toBeNull();
    vi.stubEnv('ABUSE_GUARD_BACKEND', 'off');
    await expect(
      getUpstashRestRedisClient({ family: 'replay' })
    ).resolves.toBeNull();

    const payloads = error.mock.calls.map(([message]) =>
      JSON.parse(String(message).replace(/^[^{]*/, ''))
    );
    expect(payloads.map((entry) => entry.reason)).toEqual([
      'invalid-guard-config',
      'selector-off',
    ]);
    // Never a value, length or partial of the weak secret.
    expect(JSON.stringify(payloads)).not.toMatch(
      /short-secret|18|guard\.fixture/
    );
  });

  it('takes the app field from static configuration only, never request data', async () => {
    const { guardAlertServiceName } = await import('../upstash-rest.js');
    expect(guardAlertServiceName({ TUTURUUU_SERVICE_NAME: 'web' })).toBe('web');
    expect(
      guardAlertServiceName({ VERCEL_PROJECT_PRODUCTION_URL: 'tuturuuu.com' })
    ).toBe('tuturuuu.com');
    expect(
      guardAlertServiceName({
        VERCEL_PROJECT_PRODUCTION_URL: 'https://Tuturuuu.com/path',
      })
    ).toBe('tuturuuu.com');
    for (const value of ['evil host', '<script>', 'a'.repeat(80), ''])
      expect(guardAlertServiceName({ TUTURUUU_SERVICE_NAME: value })).toBe(
        'unknown'
      );
    expect(guardAlertServiceName({})).toBe('unknown');
  });
});
