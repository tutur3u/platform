import { afterEach, describe, expect, it, vi } from 'vitest';

describe('checkRateLimit Redis command failures', () => {
  afterEach(() => {
    vi.doUnmock('@tuturuuu/utils/upstash-rest');
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('allows requests when Redis commands fail', async () => {
    vi.doMock('@tuturuuu/utils/upstash-rest', () => ({
      getUpstashRestRedisClient: async () => ({
        expire: vi.fn(),
        incr: vi.fn(async () => {
          throw new Error('redis unavailable');
        }),
        ttl: vi.fn(),
      }),
      hasUpstashRestEnv: () => true,
    }));

    const { checkRateLimit } = await import('../lib/rate-limit');
    const config = { maxRequests: 1, windowMs: 60_000 };

    await expect(checkRateLimit('redis-error', config)).resolves.toMatchObject({
      allowed: true,
    });
    await expect(checkRateLimit('redis-error', config)).resolves.toMatchObject({
      allowed: true,
    });
  });
});
