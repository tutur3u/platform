import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
  redis: vi.fn(),
  extractIp: vi.fn(),
  isBlocked: vi.fn(),
  validateEmoji: vi.fn(),
}));

vi.mock('@upstash/ratelimit', () => {
  class MockRatelimit {
    static slidingWindow(limit: number, window: string) {
      return { limit, window };
    }

    limit(ip: string) {
      return mocks.limit(ip);
    }
  }

  return { Ratelimit: MockRatelimit };
});

vi.mock('@upstash/redis', () => ({
  Redis: class MockRedis {
    static fromEnv() {
      return mocks.redis();
    }

    constructor(config: unknown) {
      mocks.redis(config);
    }
  },
}));

vi.mock('../abuse-protection/edge', () => ({
  extractIPFromRequest: (headers: Headers) => mocks.extractIp(headers),
  isIPBlockedEdge: (ip: string) => mocks.isBlocked(ip),
}));

vi.mock('../request-emoji-limit', () => ({
  validateRequestEmojiLimit: (req: NextRequest) => mocks.validateEmoji(req),
}));

function makeRequest(method = 'POST', headers?: Record<string, string>) {
  return new NextRequest('http://localhost/api/test', {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : '{}',
  });
}

describe('guardApiProxyRequest', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.limit.mockReset();
    mocks.redis.mockReset();
    mocks.extractIp.mockReset();
    mocks.isBlocked.mockReset();
    mocks.validateEmoji.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects oversized payloads before rate limiting', async () => {
    const { guardApiProxyRequest } = await import('../api-proxy-guard.js');
    const response = await guardApiProxyRequest(
      makeRequest('POST', { 'content-length': `${1024 * 1024 + 1}` }),
      { prefixBase: 'proxy:test:api' }
    );

    expect(response?.status).toBe(413);
    expect(mocks.extractIp).not.toHaveBeenCalled();
  });

  it('returns an IP-block response when the client is blocked', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue({
      expiresAt: new Date(Date.now() + 30_000),
      reason: 'abuse',
      blockLevel: 'temporary',
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const response = await guardApiProxyRequest(makeRequest('POST'), {
      prefixBase: 'proxy:test:api',
    });

    expect(response?.status).toBe(429);
    expect(mocks.limit).not.toHaveBeenCalled();
  });

  it('rate limits GET requests across minute, hourly, and daily buckets', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.limit
      .mockResolvedValueOnce({
        success: true,
        limit: 120,
        remaining: 119,
        reset: Date.now() + 15_000,
      })
      .mockResolvedValueOnce({
        success: false,
        limit: 2000,
        remaining: 0,
        reset: Date.now() + 15_000,
      });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const response = await guardApiProxyRequest(makeRequest('GET'), {
      prefixBase: 'proxy:test:api',
    });

    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-RateLimit-Limit')).toBe('2000');
    expect(response?.headers.get('X-RateLimit-Window')).toBe('hour');
    expect(mocks.validateEmoji).not.toHaveBeenCalled();
  });

  it('delegates to emoji validation after rate limiting passes', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.limit
      .mockResolvedValueOnce({
        success: true,
        limit: 30,
        remaining: 29,
        reset: Date.now() + 60_000,
      })
      .mockResolvedValueOnce({
        success: true,
        limit: 300,
        remaining: 299,
        reset: Date.now() + 60_000,
      })
      .mockResolvedValueOnce({
        success: true,
        limit: 1000,
        remaining: 999,
        reset: Date.now() + 60_000,
      });

    const emojiResponse = new Response(null, { status: 400 });
    mocks.validateEmoji.mockResolvedValue(emojiResponse);

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const response = await guardApiProxyRequest(makeRequest('POST'), {
      prefixBase: 'proxy:test:api',
    });

    expect(response).toBe(emojiResponse);
    expect(mocks.validateEmoji).toHaveBeenCalledTimes(1);
  });
});
