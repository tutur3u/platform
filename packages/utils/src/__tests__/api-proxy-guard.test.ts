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

function makeRequest(
  pathname = '/api/test',
  method = 'POST',
  headers?: Record<string, string>
) {
  return new NextRequest(`http://localhost${pathname}`, {
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
      makeRequest('/api/test', 'POST', {
        'content-length': `${1024 * 1024 + 1}`,
      }),
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

    const response = await guardApiProxyRequest(
      makeRequest('/api/test', 'POST'),
      {
        prefixBase: 'proxy:test:api',
      }
    );

    expect(response?.status).toBe(429);
    expect(mocks.limit).not.toHaveBeenCalled();
  });

  it('does not rate limit generic GET routes', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const response = await guardApiProxyRequest(
      makeRequest('/api/test', 'GET'),
      {
        prefixBase: 'proxy:test:api',
      }
    );

    expect(response).toBeNull();
    expect(mocks.limit).not.toHaveBeenCalled();
  });

  it('does not rate limit users/me reads', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const response = await guardApiProxyRequest(
      makeRequest('/api/v1/users/me/configs/demo', 'GET'),
      { prefixBase: 'proxy:test:api' }
    );

    expect(response).toBeNull();
    expect(mocks.limit).not.toHaveBeenCalled();
  });

  it('does not rate limit workspace user database reads', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const response = await guardApiProxyRequest(
      makeRequest('/api/v1/workspaces/ws-1/users/database?page=1', 'GET'),
      { prefixBase: 'proxy:test:api' }
    );

    expect(response).toBeNull();
    expect(mocks.limit).not.toHaveBeenCalled();
  });

  it('uses the dedicated otp-send bucket for mobile OTP sends', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.limit.mockResolvedValueOnce({
      success: false,
      limit: 1,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const response = await guardApiProxyRequest(
      makeRequest('/api/v1/auth/mobile/send-otp', 'POST'),
      { prefixBase: 'proxy:test:api' }
    );

    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-RateLimit-Limit')).toBe('1');
    expect(response?.headers.get('X-RateLimit-Policy')).toBe('otp-send');
  });

  it('keeps verify-otp on the strict auth bucket', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.limit.mockResolvedValueOnce({
      success: false,
      limit: 3,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const response = await guardApiProxyRequest(
      makeRequest('/api/v1/auth/mobile/verify-otp', 'POST'),
      { prefixBase: 'proxy:test:api' }
    );

    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-RateLimit-Limit')).toBe('3');
    expect(response?.headers.get('X-RateLimit-Policy')).toBe('auth');
  });

  it('uses strict high-fanout buckets for email routes', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.limit.mockResolvedValueOnce({
      success: false,
      limit: 2,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const response = await guardApiProxyRequest(
      makeRequest('/api/v1/workspaces/ws-1/mail/send', 'POST'),
      { prefixBase: 'proxy:test:api' }
    );

    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-RateLimit-Limit')).toBe('2');
    expect(response?.headers.get('X-RateLimit-Policy')).toBe('high-fanout');
  });

  it('uses relaxed buckets for task description persistence routes', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.limit.mockResolvedValueOnce({
      success: false,
      limit: 60,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const response = await guardApiProxyRequest(
      makeRequest('/api/v1/workspaces/ws-1/tasks/task-1/description', 'PATCH'),
      { prefixBase: 'proxy:test:api' }
    );

    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-RateLimit-Limit')).toBe('60');
    expect(response?.headers.get('X-RateLimit-Policy')).toBe(
      'task-description'
    );
  });

  it('keeps non-description task mutations on the default strict bucket', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.limit.mockResolvedValueOnce({
      success: false,
      limit: 12,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const response = await guardApiProxyRequest(
      makeRequest('/api/v1/workspaces/ws-1/tasks/task-1', 'PUT'),
      { prefixBase: 'proxy:test:api' }
    );

    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-RateLimit-Limit')).toBe('12');
    expect(response?.headers.get('X-RateLimit-Policy')).toBe('default');
  });

  it('bypasses trusted cron traffic only when credentials are present', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockReturnValue({});

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const allowedResponse = await guardApiProxyRequest(
      makeRequest('/api/cron/process-notification-batches', 'POST', {
        authorization: 'Bearer cron-secret',
      }),
      { prefixBase: 'proxy:test:api' }
    );

    expect(allowedResponse).toBeNull();
    expect(mocks.extractIp).not.toHaveBeenCalled();

    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.limit.mockResolvedValueOnce({
      success: false,
      limit: 12,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const blockedResponse = await guardApiProxyRequest(
      makeRequest('/api/cron/process-notification-batches', 'POST', {
        authorization: 'Bearer wrong-secret',
      }),
      { prefixBase: 'proxy:test:api' }
    );

    expect(blockedResponse?.status).toBe(429);
    expect(blockedResponse?.headers.get('X-RateLimit-Policy')).toBe('default');
  });

  it('bypasses trusted webhook traffic only with required signature headers', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('POLAR_WEBHOOK_SECRET', 'polar-secret');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockReturnValue({});

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const allowedResponse = await guardApiProxyRequest(
      makeRequest('/api/payment/webhooks', 'POST', {
        'webhook-id': 'id',
        'webhook-signature': 'sig',
        'webhook-timestamp': 'ts',
      }),
      { prefixBase: 'proxy:test:api' }
    );

    expect(allowedResponse).toBeNull();

    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.limit.mockResolvedValueOnce({
      success: false,
      limit: 12,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const blockedResponse = await guardApiProxyRequest(
      makeRequest('/api/payment/webhooks', 'POST', {
        'webhook-id': 'id',
      }),
      { prefixBase: 'proxy:test:api' }
    );

    expect(blockedResponse?.status).toBe(429);
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
        limit: 12,
        remaining: 11,
        reset: Date.now() + 60_000,
      })
      .mockResolvedValueOnce({
        success: true,
        limit: 120,
        remaining: 119,
        reset: Date.now() + 60_000,
      })
      .mockResolvedValueOnce({
        success: true,
        limit: 400,
        remaining: 399,
        reset: Date.now() + 60_000,
      });

    const emojiResponse = new Response(null, { status: 400 });
    mocks.validateEmoji.mockResolvedValue(emojiResponse);

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const response = await guardApiProxyRequest(
      makeRequest('/api/test', 'POST'),
      { prefixBase: 'proxy:test:api' }
    );

    expect(response).toBe(emojiResponse);
    expect(mocks.validateEmoji).toHaveBeenCalledTimes(1);
  });
});
