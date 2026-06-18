import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getClient: vi.fn(),
  mget: vi.fn(),
  set: vi.fn(),
}));

vi.mock('../../upstash-rest', () => ({
  getUpstashRestRedisClient: () => mocks.getClient(),
}));

function mockRedisClient() {
  mocks.getClient.mockResolvedValue({
    mget: (...keys: string[]) => mocks.mget(...keys),
    set: (key: string, value: unknown, options?: unknown) =>
      mocks.set(key, value, options),
  });
}

describe('edge-trust cache', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getClient.mockReset();
    mocks.mget.mockReset();
    mocks.set.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns only elevated subjects from getCachedTrustMultipliers', async () => {
    mockRedisClient();
    // Order of values matches the order of keys requested.
    mocks.mget.mockResolvedValue([3, null, 1, 2]);

    const { getCachedTrustMultipliers } = await import('../edge-trust.js');
    const result = await getCachedTrustMultipliers([
      'session:aaa',
      'cidr:1.2.3.0/24',
      'ip:1.2.3.4',
      'user:abc',
    ]);

    expect(result.get('session:aaa')).toBe(3);
    expect(result.has('cidr:1.2.3.0/24')).toBe(false); // null
    expect(result.has('ip:1.2.3.4')).toBe(false); // neutral (1)
    expect(result.get('user:abc')).toBe(2);
  });

  it('clamps cached multipliers to the DB ceiling', async () => {
    mockRedisClient();
    mocks.mget.mockResolvedValue([5000]);

    const { getCachedTrustMultipliers } = await import('../edge-trust.js');
    const result = await getCachedTrustMultipliers(['session:aaa']);

    expect(result.get('session:aaa')).toBe(1000);
  });

  it('takes the most-trusting multiplier in getCachedTrustMultiplier', async () => {
    mockRedisClient();
    mocks.mget.mockResolvedValue([2, 3]);

    const { getCachedTrustMultiplier } = await import('../edge-trust.js');
    const best = await getCachedTrustMultiplier([
      'cidr:1.2.3.0/24',
      'session:aaa',
    ]);

    expect(best).toBe(3);
  });

  it('parses string multipliers from Redis', async () => {
    mockRedisClient();
    mocks.mget.mockResolvedValue(['2.5']);

    const { getCachedTrustMultiplier } = await import('../edge-trust.js');
    expect(await getCachedTrustMultiplier(['session:aaa'])).toBe(2.5);
  });

  it('returns neutral verified session entries without treating plain neutral entries as active', async () => {
    mockRedisClient();
    mocks.mget.mockResolvedValue([{ m: 1, verified: true }, 1]);

    const { getCachedTrustEntries } = await import('../edge-trust.js');
    const entries = await getCachedTrustEntries(['session:aaa', 'session:bbb']);

    expect(entries.get('session:aaa')).toEqual({ m: 1, verified: true });
    expect(entries.has('session:bbb')).toBe(false);
  });

  it('fails open to a neutral multiplier when Redis errors', async () => {
    mockRedisClient();
    mocks.mget.mockRejectedValue(new Error('redis down'));

    const { getCachedTrustMultiplier, getCachedTrustMultipliers } =
      await import('../edge-trust.js');

    expect(await getCachedTrustMultiplier(['session:aaa'])).toBe(1);
    expect((await getCachedTrustMultipliers(['session:aaa'])).size).toBe(0);
  });

  it('fails open when no Redis client is configured', async () => {
    mocks.getClient.mockResolvedValue(null);

    const { getCachedTrustMultiplier } = await import('../edge-trust.js');
    expect(await getCachedTrustMultiplier(['session:aaa'])).toBe(1);
  });

  it('writes a clamped multiplier with a TTL', async () => {
    mockRedisClient();
    mocks.set.mockResolvedValue('OK');

    const { setCachedTrustMultiplier } = await import('../edge-trust.js');
    await setCachedTrustMultiplier('cidr:1.2.3.0/24', 5000, 7200);

    expect(mocks.set).toHaveBeenCalledWith('trust:mult:cidr:1.2.3.0/24', 1000, {
      ex: 7200,
    });
  });

  it('skips neutral multipliers in writeTrustCacheForSubjects', async () => {
    mockRedisClient();
    mocks.set.mockResolvedValue('OK');

    const { writeTrustCacheForSubjects } = await import('../edge-trust.js');
    await writeTrustCacheForSubjects(['session:aaa', 'cidr:1.2.3.0/24'], 1);

    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('writes every subject key for an elevated multiplier', async () => {
    mockRedisClient();
    mocks.set.mockResolvedValue('OK');

    const { writeTrustCacheForSubjects } = await import('../edge-trust.js');
    await writeTrustCacheForSubjects(
      ['session:aaa', 'cidr:1.2.3.0/24'],
      3,
      600
    );

    expect(mocks.set).toHaveBeenCalledWith('trust:mult:session:aaa', 3, {
      ex: 600,
    });
    expect(mocks.set).toHaveBeenCalledWith('trust:mult:cidr:1.2.3.0/24', 3, {
      ex: 600,
    });
  });

  it('writes neutral verified session markers without writing non-session subjects', async () => {
    mockRedisClient();
    mocks.set.mockResolvedValue('OK');

    const { writeVerifiedSessionCacheForSubjects } = await import(
      '../edge-trust.js'
    );
    await writeVerifiedSessionCacheForSubjects(
      ['session:aaa', 'cidr:1.2.3.0/24'],
      600
    );

    expect(mocks.set).toHaveBeenCalledTimes(1);
    expect(mocks.set).toHaveBeenCalledWith(
      'trust:mult:session:aaa',
      { m: 1, verified: true },
      { ex: 600 }
    );
  });

  it('parses legacy plain numbers and rich JSON entries together', async () => {
    mockRedisClient();
    mocks.mget.mockResolvedValue([
      3, // legacy plain number
      { m: 1, mode: 'unlimited' }, // rich object (auto-deserialized by upstash)
      { m: 1, mode: 'absolute', abs: { minute: 500 } },
    ]);

    const { getCachedTrustEntries } = await import('../edge-trust.js');
    const entries = await getCachedTrustEntries([
      'session:legacy',
      'cidr:unl',
      'ip:abs',
    ]);

    expect(entries.get('session:legacy')).toEqual({ m: 3 });
    expect(entries.get('cidr:unl')).toEqual({ m: 1, mode: 'unlimited' });
    expect(entries.get('ip:abs')).toEqual({
      abs: { minute: 500 },
      m: 1,
      mode: 'absolute',
    });
  });

  it('writes rich entries as JSON and multiplier-only as a plain number', async () => {
    mockRedisClient();
    mocks.set.mockResolvedValue('OK');

    const { setCachedTrustEntry } = await import('../edge-trust.js');
    await setCachedTrustEntry('session:a', { m: 3 }, 600);
    await setCachedTrustEntry(
      'cidr:b',
      { abs: { minute: 500 }, m: 1, mode: 'absolute' },
      600
    );

    expect(mocks.set).toHaveBeenCalledWith('trust:mult:session:a', 3, {
      ex: 600,
    });
    expect(mocks.set).toHaveBeenCalledWith(
      'trust:mult:cidr:b',
      { abs: { minute: 500 }, m: 1, mode: 'absolute' },
      { ex: 600 }
    );
  });

  it('honors the configurable cache TTL', async () => {
    vi.stubEnv('EDGE_TRUST_CACHE_TTL_SECONDS', '900');
    mockRedisClient();
    mocks.set.mockResolvedValue('OK');

    const { setCachedTrustMultiplier } = await import('../edge-trust.js');
    await setCachedTrustMultiplier('session:aaa', 3);

    expect(mocks.set).toHaveBeenCalledWith('trust:mult:session:aaa', 3, {
      ex: 900,
    });
  });
});
