import { afterEach, describe, expect, it, vi } from 'vitest';

describe('abuse protection Redis fail-open behavior', () => {
  afterEach(() => {
    vi.doUnmock('../../upstash-rest');
    vi.doUnmock('@tuturuuu/supabase/next/server');
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('allows checks and skips persistent IP block lookups when Redis is not configured', async () => {
    const from = vi.fn(() => ({
      insert: vi.fn(async () => ({ error: null })),
    }));
    const rpc = vi.fn();
    const createAdminClient = vi.fn(async () => ({ from, rpc }));
    const getRedis = vi.fn();

    vi.doMock('../../upstash-rest', () => ({
      getUpstashRestRedisClient: getRedis,
      hasUpstashRestEnv: () => false,
    }));
    vi.doMock('@tuturuuu/supabase/next/server', () => ({
      createAdminClient,
    }));

    const { checkPasswordLoginLimit, isIPBlocked, recordPasswordLoginFailure } =
      await import('../index.js');

    for (let attempt = 0; attempt < 20; attempt += 1) {
      await recordPasswordLoginFailure('203.0.113.80', 'user@example.com');
    }

    await expect(isIPBlocked('203.0.113.80')).resolves.toBeNull();
    await expect(
      checkPasswordLoginLimit('203.0.113.80', 'user@example.com')
    ).resolves.toMatchObject({
      allowed: true,
    });
    expect(getRedis).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith('get_active_ip_block', {
      p_ip_address: '203.0.113.80',
    });
    expect(from).not.toHaveBeenCalledWith('blocked_ips');
  });

  it('allows checks and skips counter writes after Redis commands fail', async () => {
    const from = vi.fn(() => ({
      insert: vi.fn(async () => ({ error: null })),
    }));
    const rpc = vi.fn();
    const createAdminClient = vi.fn(async () => ({ from, rpc }));
    const redis = {
      del: vi.fn(),
      expire: vi.fn(),
      get: vi.fn(async () => {
        throw new Error('redis unavailable');
      }),
      incr: vi.fn(async () => {
        throw new Error('redis unavailable');
      }),
      set: vi.fn(),
      ttl: vi.fn(),
    };

    vi.doMock('../../upstash-rest', () => ({
      getUpstashRestRedisClient: async () => redis,
      hasUpstashRestEnv: () => true,
    }));
    vi.doMock('@tuturuuu/supabase/next/server', () => ({
      createAdminClient,
    }));

    const { checkPasswordLoginLimit, isIPBlocked, recordPasswordLoginFailure } =
      await import('../index.js');

    await expect(isIPBlocked('203.0.113.81')).resolves.toBeNull();
    await expect(
      checkPasswordLoginLimit('203.0.113.81', 'user@example.com')
    ).resolves.toMatchObject({
      allowed: true,
    });
    await expect(
      recordPasswordLoginFailure('203.0.113.81', 'user@example.com')
    ).resolves.toBeUndefined();
    expect(redis.expire).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith('get_active_ip_block', {
      p_ip_address: '203.0.113.81',
    });
    expect(from).not.toHaveBeenCalledWith('blocked_ips');
  });
});
