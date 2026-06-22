import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
  ratelimitConfigs: [] as Array<{ limit: number; window: string }>,
  ratelimitPrefixes: [] as string[],
  redis: vi.fn(),
  extractIp: vi.fn(),
  isBlocked: vi.fn(),
  validateEmoji: vi.fn(),
  getTrustEntries: vi.fn(),
}));

vi.mock('@upstash/ratelimit', () => {
  class MockRatelimit {
    prefix: string;

    static slidingWindow(limit: number, window: string) {
      mocks.ratelimitConfigs.push({ limit, window });
      return { limit, window };
    }

    constructor(config: { prefix: string }) {
      this.prefix = config.prefix;
      mocks.ratelimitPrefixes.push(config.prefix);
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

vi.mock('../abuse-protection/edge-trust', () => ({
  getCachedTrustEntries: (keys: string[]) => mocks.getTrustEntries(keys),
}));

vi.mock('../request-emoji-limit', () => ({
  validateRequestEmojiLimit: (
    req: NextRequest,
    options?: {
      allowDescriptionYjsState?: boolean;
      skipValidationForFields?: string[];
    }
  ) => mocks.validateEmoji(req, options),
}));

function makeRequest(
  pathname = '/api/test',
  method = 'POST',
  headers?: Record<string, string>,
  body = '{}'
) {
  return new NextRequest(`http://localhost${pathname}`, {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : body,
  });
}

function singleReadRoutePolicies() {
  return [
    {
      key: 'redis-fallback-test',
      matches: () => true,
      rateLimits: {
        get: [
          { duration: '1 m' as const, limit: 1, window: 'minute' as const },
        ],
        mutate: [],
      },
    },
  ];
}

describe('guardApiProxyRequest', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.limit.mockReset();
    mocks.ratelimitConfigs.length = 0;
    mocks.ratelimitPrefixes.length = 0;
    mocks.redis.mockReset();
    mocks.extractIp.mockReset();
    mocks.isBlocked.mockReset();
    mocks.validateEmoji.mockReset();
    mocks.getTrustEntries.mockReset();
    // Default: no cached trust (untrusted). Tests opt in by overriding.
    mocks.getTrustEntries.mockResolvedValue(new Map<string, { m: number }>());
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

  it('rejects oversized payloads without trusting Content-Length', async () => {
    const { guardApiProxyRequest } = await import('../api-proxy-guard.js');
    const request = makeRequest(
      '/api/test',
      'POST',
      { 'content-type': 'application/json' },
      JSON.stringify({ value: 'x'.repeat(1024 * 1024) })
    );

    expect(request.headers.get('content-length')).toBeNull();

    const response = await guardApiProxyRequest(request, {
      prefixBase: 'proxy:test:api',
    });

    expect(response?.status).toBe(413);
    expect(mocks.extractIp).not.toHaveBeenCalled();
    expect(mocks.validateEmoji).not.toHaveBeenCalled();
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
    expect(response?.headers.get('X-Proxy-Block-Reason')).toBe(
      'ip-already-blocked'
    );
    expect(mocks.limit).not.toHaveBeenCalled();
  });

  it('rate limits anonymous generic GET routes', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.limit.mockResolvedValueOnce({
      success: false,
      limit: 20,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const response = await guardApiProxyRequest(
      makeRequest('/api/test', 'GET'),
      {
        prefixBase: 'proxy:test:api',
      }
    );

    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-RateLimit-Limit')).toBe('20');
    expect(response?.headers.get('X-RateLimit-Caller-Class')).toBe('anonymous');
    expect(response?.headers.get('X-RateLimit-Policy')).toBe('default');
  });

  it('uses the task-board read bucket for high-fanout board task reads', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.limit.mockResolvedValueOnce({
      success: false,
      limit: 600,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const response = await guardApiProxyRequest(
      makeRequest('/api/v1/workspaces/ws-1/tasks?boardId=board-1', 'GET'),
      {
        prefixBase: 'proxy:test:api',
      }
    );

    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-RateLimit-Limit')).toBe('600');
    expect(response?.headers.get('X-RateLimit-Policy')).toBe('task-board-read');
    expect(mocks.ratelimitConfigs).toContainEqual({
      limit: 600,
      window: '1 m',
    });
    expect(mocks.ratelimitPrefixes).toContain(
      'proxy:test:api:task-board-read:anonymous:get:minute'
    );
  });

  it('uses the task-board read bucket for task-board detail and list reads', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.limit
      .mockResolvedValueOnce({
        success: true,
        limit: 300,
        remaining: 299,
        reset: Date.now() + 15_000,
      })
      .mockResolvedValueOnce({
        success: true,
        limit: 3000,
        remaining: 2999,
        reset: Date.now() + 15_000,
      })
      .mockResolvedValueOnce({
        success: true,
        limit: 20000,
        remaining: 19999,
        reset: Date.now() + 15_000,
      })
      .mockResolvedValueOnce({
        success: false,
        limit: 300,
        remaining: 0,
        reset: Date.now() + 15_000,
      });
    mocks.validateEmoji.mockResolvedValue(null);

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const detailResponse = await guardApiProxyRequest(
      makeRequest('/api/v1/workspaces/ws-1/task-boards/board-1', 'GET'),
      {
        prefixBase: 'proxy:test:api',
      }
    );
    const listsResponse = await guardApiProxyRequest(
      makeRequest('/api/v1/workspaces/ws-1/task-boards/board-1/lists', 'GET'),
      {
        prefixBase: 'proxy:test:api',
      }
    );

    expect(detailResponse).toBeNull();
    expect(listsResponse?.status).toBe(429);
    expect(listsResponse?.headers.get('X-RateLimit-Policy')).toBe(
      'task-board-read'
    );
  });

  it('uses the finance read bucket for common Finance app reads', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.limit.mockResolvedValue({
      success: false,
      limit: 1200,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const financeReads = [
      { method: 'GET', path: '/api/workspaces/ws-1/finance/overview' },
      {
        method: 'GET',
        path: '/api/workspaces/ws-1/finance/charts/categories',
      },
      {
        method: 'GET',
        path: '/api/workspaces/ws-1/transactions/infinite?limit=20',
      },
      {
        method: 'GET',
        path: '/api/workspaces/ws-1/transactions/categories',
      },
      { method: 'GET', path: '/api/workspaces/ws-1/wallets/wallet-1' },
      { method: 'HEAD', path: '/api/workspaces/ws-1/tags' },
      {
        method: 'GET',
        path: '/api/v1/workspaces/ws-1/finance/invoices/subscription/context?month=2026-06',
      },
      { method: 'GET', path: '/api/v1/workspaces/ws-1/finance/budgets' },
      { method: 'GET', path: '/api/v1/workspaces/ws-1/wallets' },
    ];

    for (const { method, path } of financeReads) {
      const response = await guardApiProxyRequest(makeRequest(path, method), {
        prefixBase: 'proxy:test:api',
      });

      expect(response?.status).toBe(429);
      expect(response?.headers.get('X-RateLimit-Limit')).toBe('1200');
      expect(response?.headers.get('X-RateLimit-Policy')).toBe('finance-read');
    }

    expect(mocks.ratelimitConfigs).toContainEqual({
      limit: 1200,
      window: '1 m',
    });
    expect(mocks.ratelimitConfigs).toContainEqual({
      limit: 12000,
      window: '1 h',
    });
    expect(mocks.ratelimitConfigs).toContainEqual({
      limit: 80000,
      window: '1 d',
    });
    expect(mocks.ratelimitPrefixes).toContain(
      'proxy:test:api:finance-read:anonymous:get:minute'
    );
  });

  it('keeps Finance auth-looking reads anonymous at proxy time', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.limit.mockResolvedValue({
      success: false,
      limit: 1200,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const authLookingHeaders: Record<string, string>[] = [
      { authorization: 'Bearer ttr_fake' },
      {
        cookie:
          'sb-resolved-kingfish-21146-auth-token.0=base64-validvalue; theme=dark',
      },
      { cookie: 'tuturuuu_app_session=app-session-token; theme=dark' },
    ];

    for (const headers of authLookingHeaders) {
      const response = await guardApiProxyRequest(
        makeRequest('/api/workspaces/ws-1/finance/overview', 'GET', headers),
        {
          prefixBase: 'proxy:test:api',
        }
      );

      expect(response?.status).toBe(429);
      expect(response?.headers.get('X-RateLimit-Caller-Class')).toBe(
        'anonymous'
      );
      expect(response?.headers.get('X-RateLimit-Policy')).toBe('finance-read');
    }
  });

  it('uses the finance invoice create read bucket for invoice support reads', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.limit.mockResolvedValue({
      success: false,
      limit: 1200,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const userId = '11111111-1111-4111-8111-111111111111';
    const groupId = '22222222-2222-4222-8222-222222222222';
    const supportReads = [
      { method: 'GET', path: '/api/v1/workspaces/ws-1/users' },
      {
        method: 'GET',
        path: `/api/v1/workspaces/ws-1/users/${userId}/user-groups`,
      },
      {
        method: 'GET',
        path: '/api/v1/workspaces/ws-1/inventory/products?page=1',
      },
      { method: 'GET', path: '/api/v1/workspaces/ws-1/promotions' },
      {
        method: 'GET',
        path: '/api/v1/workspaces/ws-1/settings/configs?ids=default_wallet_id',
      },
      {
        method: 'GET',
        path: `/api/v1/workspaces/ws-1/user-groups/${groupId}/linked-products`,
      },
    ];

    for (const { method, path } of supportReads) {
      const response = await guardApiProxyRequest(makeRequest(path, method), {
        prefixBase: 'proxy:test:api',
      });

      expect(response?.status).toBe(429);
      expect(response?.headers.get('X-RateLimit-Limit')).toBe('1200');
      expect(response?.headers.get('X-RateLimit-Policy')).toBe(
        'finance-invoice-create-read'
      );
    }

    expect(mocks.ratelimitConfigs).toContainEqual({
      limit: 1200,
      window: '1 m',
    });
    expect(mocks.ratelimitPrefixes).toContain(
      'proxy:test:api:finance-invoice-create-read:anonymous:get:minute'
    );
  });

  it('honors finance read bucket environment overrides', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    vi.stubEnv('API_PROXY_FINANCE_READ_LIMIT_MINUTE', '1500');
    vi.stubEnv('API_PROXY_FINANCE_INVOICE_CREATE_READ_LIMIT_MINUTE', '750');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.limit.mockResolvedValueOnce({
      success: false,
      limit: 1500,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const response = await guardApiProxyRequest(
      makeRequest('/api/workspaces/ws-1/finance/overview', 'GET'),
      {
        prefixBase: 'proxy:test:api',
      }
    );

    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-RateLimit-Limit')).toBe('1500');
    expect(response?.headers.get('X-RateLimit-Policy')).toBe('finance-read');
    expect(mocks.ratelimitConfigs).toContainEqual({
      limit: 1500,
      window: '1 m',
    });
    expect(mocks.ratelimitConfigs).not.toContainEqual({
      limit: 750,
      window: '1 m',
    });
  });

  it('uses legacy finance invoice read environment aliases when new Finance vars are absent', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    vi.stubEnv('API_PROXY_FINANCE_INVOICE_CREATE_READ_LIMIT_MINUTE', '750');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.limit.mockResolvedValueOnce({
      success: false,
      limit: 750,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const response = await guardApiProxyRequest(
      makeRequest('/api/v1/workspaces/ws-1/users', 'GET'),
      {
        prefixBase: 'proxy:test:api',
      }
    );

    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-RateLimit-Limit')).toBe('750');
    expect(response?.headers.get('X-RateLimit-Policy')).toBe(
      'finance-invoice-create-read'
    );
    expect(mocks.ratelimitConfigs).toContainEqual({
      limit: 750,
      window: '1 m',
    });
  });

  it('uses the users database read-over-post bucket for search and filter POST reads', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.limit.mockResolvedValue({
      success: false,
      limit: 300,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    for (const path of [
      '/api/v1/workspaces/ws-1/users/database',
      '/api/v1/workspaces/ws-1/users/groups/featured-counts',
      '/api/v1/workspaces/ws-1/users/groups/possible-excluded',
    ]) {
      const response = await guardApiProxyRequest(makeRequest(path, 'POST'), {
        prefixBase: 'proxy:test:api',
      });

      expect(response?.status).toBe(429);
      expect(response?.headers.get('X-RateLimit-Limit')).toBe('300');
      expect(response?.headers.get('X-RateLimit-Policy')).toBe(
        'users-database-read-over-post'
      );
    }

    expect(mocks.ratelimitConfigs).toContainEqual({
      limit: 300,
      window: '1 m',
    });
    expect(mocks.ratelimitConfigs).toContainEqual({
      limit: 3000,
      window: '1 h',
    });
    expect(mocks.ratelimitConfigs).toContainEqual({
      limit: 20_000,
      window: '1 d',
    });
    expect(mocks.ratelimitPrefixes).toContain(
      'proxy:test:api:users-database-read-over-post:anonymous:mutate:minute'
    );
  });

  it('uses a dedicated users-admin read bucket for lightweight user reads', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.limit.mockResolvedValue({
      success: false,
      limit: 1200,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    for (const path of [
      '/api/v1/workspaces/ws-1/users/database',
      '/api/v1/workspaces/ws-1/users/groups',
      '/api/v1/workspaces/ws-1/users/11111111-1111-4111-8111-111111111111/attendance',
      '/api/v1/workspaces/ws-1/users/11111111-1111-4111-8111-111111111111/emails',
      '/api/v1/workspaces/ws-1/users/11111111-1111-4111-8111-111111111111/referrals',
      '/api/v1/workspaces/ws-1/users/feedbacks',
      '/api/v1/workspaces/ws-1/user-groups/group-1',
      '/api/v1/workspaces/ws-1/user-groups/group-1/members',
      '/api/v1/workspaces/ws-1/user-groups/group-1/members/user-1/feedbacks',
      '/api/v1/workspaces/ws-1/user-groups/group-1/attendance',
      '/api/v1/workspaces/ws-1/user-groups/group-1/posts/post-1/status',
      '/api/v1/workspaces/ws-1/user-groups/group-1/linked-products',
      '/api/v1/workspaces/ws-1/user-groups/group-1/indicators/categories/category-1',
    ]) {
      const response = await guardApiProxyRequest(makeRequest(path, 'GET'), {
        prefixBase: 'proxy:test:api',
      });

      expect(response?.status).toBe(429);
      expect(response?.headers.get('X-RateLimit-Limit')).toBe('1200');
      expect(response?.headers.get('X-RateLimit-Policy')).toBe(
        'users-admin-read'
      );
    }

    expect(mocks.ratelimitConfigs).toContainEqual({
      limit: 1200,
      window: '1 m',
    });
    expect(mocks.ratelimitConfigs).toContainEqual({
      limit: 12_000,
      window: '1 h',
    });
    expect(mocks.ratelimitConfigs).toContainEqual({
      limit: 80_000,
      window: '1 d',
    });
    expect(mocks.ratelimitPrefixes).toContain(
      'proxy:test:api:users-admin-read:anonymous:get:minute'
    );
  });

  it('keeps user admin mutations on mutation buckets', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.limit.mockResolvedValue({
      success: false,
      limit: 30,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    for (const path of [
      '/api/v1/workspaces/ws-1/users/feedbacks',
      '/api/v1/workspaces/ws-1/user-groups/group-1/members',
      '/api/v1/workspaces/ws-1/user-groups/group-1/attendance',
      '/api/v1/workspaces/ws-1/user-groups/group-1/linked-products',
    ]) {
      const response = await guardApiProxyRequest(makeRequest(path, 'POST'), {
        prefixBase: 'proxy:test:api',
      });

      expect(response?.status).toBe(429);
      expect(response?.headers.get('X-RateLimit-Limit')).toBe('30');
      expect(response?.headers.get('X-RateLimit-Policy')).toBe('default');
    }
  });

  it('keeps users mutations on the default mutation bucket', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.limit.mockResolvedValue({
      success: false,
      limit: 30,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const response = await guardApiProxyRequest(
      makeRequest(
        '/api/v1/workspaces/ws-1/users/11111111-1111-4111-8111-111111111111/referrals',
        'POST'
      ),
      {
        prefixBase: 'proxy:test:api',
      }
    );

    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-RateLimit-Limit')).toBe('30');
    expect(response?.headers.get('X-RateLimit-Policy')).toBe('default');
  });

  it('keeps finance invoice mutations on the default mutation bucket', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.limit.mockResolvedValue({
      success: false,
      limit: 30,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    for (const path of [
      '/api/v1/workspaces/ws-1/finance/invoices',
      '/api/v1/workspaces/ws-1/finance/invoices/subscription',
    ]) {
      const response = await guardApiProxyRequest(makeRequest(path, 'POST'), {
        prefixBase: 'proxy:test:api',
      });

      expect(response?.status).toBe(429);
      expect(response?.headers.get('X-RateLimit-Limit')).toBe('30');
      expect(response?.headers.get('X-RateLimit-Policy')).toBe('default');
    }

    expect(mocks.ratelimitPrefixes).toContain(
      'proxy:test:api:default:anonymous:mutate:minute'
    );
    expect(mocks.ratelimitPrefixes).not.toContain(
      'proxy:test:api:finance-invoice-create-read:anonymous:mutate:minute'
    );
  });

  it('keys verified calendar event deletes by authenticated session', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.getTrustEntries.mockImplementation((keys: string[]) => {
      const map = new Map<string, { m: number; verified: true }>();
      const sessionKey = keys.find((key) => key.startsWith('session:'));
      if (sessionKey) {
        map.set(sessionKey, { m: 1, verified: true });
      }
      return Promise.resolve(map);
    });
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
      makeRequest(
        '/api/v1/workspaces/071e0fc7-9aa8-42d8-92e5-cc9b3aeec2f1/calendar/events/68e18a3a-c527-421e-8ac3-f8b846175622',
        'DELETE',
        {
          cookie:
            'sb-resolved-kingfish-21146-auth-token.0=base64-validvalue; theme=dark',
        }
      ),
      { prefixBase: 'proxy:test:api' }
    );

    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-RateLimit-Caller-Class')).toBe(
      'authenticated'
    );
    expect(response?.headers.get('X-RateLimit-Limit')).toBe('60');
    expect(response?.headers.get('X-RateLimit-Policy')).toBe('default');
    expect(mocks.ratelimitConfigs).toContainEqual({
      limit: 60,
      window: '1 m',
    });
    expect(mocks.ratelimitPrefixes).toContain(
      'proxy:test:api:default:authenticated:mutate:minute'
    );
    expect(mocks.ratelimitPrefixes).not.toContain(
      'proxy:test:api:default:authenticated:t1:mutate:minute'
    );
    const limiterId = mocks.limit.mock.calls[0]?.[0] as string;
    expect(limiterId.startsWith('session:')).toBe(true);
  });

  it('keeps unverified calendar event deletes on the anonymous IP bucket', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.limit.mockResolvedValueOnce({
      success: false,
      limit: 30,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const response = await guardApiProxyRequest(
      makeRequest(
        '/api/v1/workspaces/071e0fc7-9aa8-42d8-92e5-cc9b3aeec2f1/calendar/events/68e18a3a-c527-421e-8ac3-f8b846175622',
        'DELETE',
        {
          cookie:
            'sb-resolved-kingfish-21146-auth-token.0=forged-value; theme=dark',
        }
      ),
      { prefixBase: 'proxy:test:api' }
    );

    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-RateLimit-Caller-Class')).toBe('anonymous');
    expect(response?.headers.get('X-RateLimit-Limit')).toBe('30');
    expect(response?.headers.get('X-RateLimit-Policy')).toBe('default');
    expect(mocks.ratelimitConfigs).toContainEqual({
      limit: 30,
      window: '1 m',
    });
    expect(mocks.ratelimitPrefixes).toContain(
      'proxy:test:api:default:anonymous:mutate:minute'
    );
    expect(mocks.limit).toHaveBeenCalledWith('ip:1.2.3.4');
  });

  it('keeps unauthenticated cron reads on a strict proxy bucket', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.limit.mockResolvedValueOnce({
      success: false,
      limit: 10,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const response = await guardApiProxyRequest(
      makeRequest('/api/cron/ai/sync-models', 'GET'),
      {
        prefixBase: 'proxy:test:api',
      }
    );

    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-RateLimit-Limit')).toBe('10');
    expect(response?.headers.get('X-RateLimit-Caller-Class')).toBe('anonymous');
    expect(response?.headers.get('X-RateLimit-Policy')).toBe('cron');
  });

  it('does not grant elevated proxy budgets from authenticated-looking headers alone', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.limit.mockResolvedValueOnce({
      success: false,
      limit: 30,
      remaining: 0,
      reset: Date.now() + 15_000,
    });
    mocks.validateEmoji.mockResolvedValue(null);

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const response = await guardApiProxyRequest(
      makeRequest('/api/test', 'POST', {
        authorization: 'Bearer ttr_fake',
      }),
      {
        prefixBase: 'proxy:test:api',
      }
    );

    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-RateLimit-Caller-Class')).toBe('anonymous');
    expect(response?.headers.get('X-RateLimit-Policy')).toBe('default');
    expect(mocks.isBlocked).toHaveBeenCalledWith('1.2.3.4');
    expect(mocks.limit).toHaveBeenCalledTimes(1);
    expect(mocks.validateEmoji).not.toHaveBeenCalled();
  });

  it('uses local rate limits when the Redis rate limiter is unreachable', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv(
      'UPSTASH_REDIS_REST_URL',
      'https://resolved-kingfish-21146.upstash.io'
    );
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.limit.mockRejectedValueOnce(new TypeError('fetch failed'));
    mocks.validateEmoji.mockResolvedValue(null);

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const options = {
      prefixBase: 'proxy:test:api',
      routePolicies: singleReadRoutePolicies(),
    };

    const response = await guardApiProxyRequest(
      makeRequest('/api/test', 'GET'),
      options
    );

    expect(response).toBeNull();
    expect(mocks.limit).toHaveBeenCalledTimes(1);

    const blockedResponse = await guardApiProxyRequest(
      makeRequest('/api/test', 'GET'),
      options
    );

    expect(blockedResponse?.status).toBe(429);
    expect(blockedResponse?.headers.get('X-Proxy-Block-Reason')).toBe(
      'route-rate-limit'
    );
    expect(blockedResponse?.headers.get('X-RateLimit-Policy')).toBe(
      'redis-fallback-test'
    );
    expect(mocks.limit).toHaveBeenCalledTimes(1);
  });

  it('uses local rate limits when Redis client initialization fails', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockImplementation(() => {
      throw new TypeError('Redis unavailable');
    });
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.validateEmoji.mockResolvedValue(null);

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const options = {
      prefixBase: 'proxy:test:api',
      routePolicies: singleReadRoutePolicies(),
    };

    const response = await guardApiProxyRequest(
      makeRequest('/api/test', 'GET'),
      options
    );

    expect(response).toBeNull();

    const blockedResponse = await guardApiProxyRequest(
      makeRequest('/api/test', 'GET'),
      options
    );

    expect(blockedResponse?.status).toBe(429);
    expect(blockedResponse?.headers.get('X-Proxy-Block-Reason')).toBe(
      'route-rate-limit'
    );
    expect(mocks.limit).not.toHaveBeenCalled();
  });

  it('rate limits anonymous users/me reads', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.limit.mockResolvedValueOnce({
      success: false,
      limit: 20,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const response = await guardApiProxyRequest(
      makeRequest('/api/v1/users/me/configs/demo', 'GET'),
      { prefixBase: 'proxy:test:api' }
    );

    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-RateLimit-Limit')).toBe('20');
    expect(response?.headers.get('X-RateLimit-Caller-Class')).toBe('anonymous');
  });

  it('keys verified users/me reads by session without applying a trust uplift', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.getTrustEntries.mockImplementation((keys: string[]) => {
      const map = new Map<string, { m: number; verified: true }>();
      const sessionKey = keys.find((key) => key.startsWith('session:'));
      if (sessionKey) {
        map.set(sessionKey, { m: 1, verified: true });
      }
      return Promise.resolve(map);
    });
    mocks.limit.mockResolvedValueOnce({
      success: false,
      limit: 600,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const response = await guardApiProxyRequest(
      makeRequest('/api/v1/users/me/profile', 'GET', {
        cookie:
          'sb-resolved-kingfish-21146-auth-token.0=base64-validvalue; theme=dark',
      }),
      { prefixBase: 'proxy:test:api' }
    );

    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-RateLimit-Caller-Class')).toBe(
      'authenticated'
    );
    expect(response?.headers.get('X-RateLimit-Limit')).toBe('600');
    expect(response?.headers.get('X-RateLimit-Policy')).toBe('users-me');
    expect(mocks.ratelimitConfigs).toContainEqual({
      limit: 600,
      window: '1 m',
    });
    expect(mocks.ratelimitPrefixes).toContain(
      'proxy:test:api:users-me:authenticated:get:minute'
    );
    expect(mocks.ratelimitPrefixes).not.toContain(
      'proxy:test:api:users-me:authenticated:t1:get:minute'
    );
    const limiterId = mocks.limit.mock.calls[0]?.[0] as string;
    expect(limiterId.startsWith('session:')).toBe(true);
  });

  it('uses the authenticated workspace read policy for verified dashboard reads', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.getTrustEntries.mockImplementation((keys: string[]) => {
      const map = new Map<string, { m: number; verified: true }>();
      const sessionKey = keys.find((key) => key.startsWith('session:'));
      if (sessionKey) {
        map.set(sessionKey, { m: 1, verified: true });
      }
      return Promise.resolve(map);
    });
    mocks.limit.mockResolvedValueOnce({
      success: false,
      limit: 600,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const response = await guardApiProxyRequest(
      makeRequest('/api/v1/workspaces/ws-1/dashboard/bootstrap', 'GET', {
        cookie:
          'sb-resolved-kingfish-21146-auth-token.0=base64-validvalue; theme=dark',
      }),
      { prefixBase: 'proxy:test:api' }
    );

    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-RateLimit-Caller-Class')).toBe(
      'authenticated'
    );
    expect(response?.headers.get('X-RateLimit-Policy')).toBe(
      'workspace-dashboard-read'
    );
    expect(mocks.ratelimitPrefixes).toContain(
      'proxy:test:api:workspace-dashboard-read:authenticated:get:minute'
    );
    const limiterId = mocks.limit.mock.calls[0]?.[0] as string;
    expect(limiterId.startsWith('session:')).toBe(true);
  });

  it('uses authenticated default read limits for verified sessions on generic reads', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.getTrustEntries.mockImplementation((keys: string[]) => {
      const map = new Map<string, { m: number; verified: true }>();
      const sessionKey = keys.find((key) => key.startsWith('session:'));
      if (sessionKey) {
        map.set(sessionKey, { m: 1, verified: true });
      }
      return Promise.resolve(map);
    });
    mocks.limit.mockResolvedValueOnce({
      success: false,
      limit: 600,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const response = await guardApiProxyRequest(
      makeRequest('/api/v1/unknown/read-only-dashboard-fragment', 'GET', {
        cookie:
          'sb-resolved-kingfish-21146-auth-token.0=base64-validvalue; theme=dark',
      }),
      { prefixBase: 'proxy:test:api' }
    );

    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-RateLimit-Caller-Class')).toBe(
      'authenticated'
    );
    expect(response?.headers.get('X-RateLimit-Limit')).toBe('600');
    expect(response?.headers.get('X-RateLimit-Policy')).toBe('default');
    expect(mocks.ratelimitPrefixes).toContain(
      'proxy:test:api:default:authenticated:get:minute'
    );
    expect(mocks.ratelimitPrefixes).not.toContain(
      'proxy:test:api:default:authenticated:t1:get:minute'
    );
    const limiterId = mocks.limit.mock.calls[0]?.[0] as string;
    expect(limiterId.startsWith('session:')).toBe(true);
  });

  it('covers legacy workspace reads with the verified workspace dashboard policy', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.getTrustEntries.mockImplementation((keys: string[]) => {
      const map = new Map<string, { m: number; verified: true }>();
      const sessionKey = keys.find((key) => key.startsWith('session:'));
      if (sessionKey) {
        map.set(sessionKey, { m: 1, verified: true });
      }
      return Promise.resolve(map);
    });
    mocks.limit.mockResolvedValueOnce({
      success: false,
      limit: 600,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const response = await guardApiProxyRequest(
      makeRequest('/api/workspaces/ws-1/settings', 'GET', {
        cookie:
          'sb-resolved-kingfish-21146-auth-token.0=base64-validvalue; theme=dark',
      }),
      { prefixBase: 'proxy:test:api' }
    );

    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-RateLimit-Caller-Class')).toBe(
      'authenticated'
    );
    expect(response?.headers.get('X-RateLimit-Policy')).toBe(
      'workspace-dashboard-read'
    );
    expect(mocks.ratelimitPrefixes).toContain(
      'proxy:test:api:workspace-dashboard-read:authenticated:get:minute'
    );
    const limiterId = mocks.limit.mock.calls[0]?.[0] as string;
    expect(limiterId.startsWith('session:')).toBe(true);
  });

  it('rate limits API client-looking bearer reads until route auth validates them', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.limit.mockResolvedValueOnce({
      success: false,
      limit: 20,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const response = await guardApiProxyRequest(
      makeRequest('/api/v1/workspaces/ws-1/users/database?page=1', 'GET', {
        authorization: 'Bearer ttr_test_key',
      }),
      { prefixBase: 'proxy:test:api' }
    );

    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-RateLimit-Caller-Class')).toBe('anonymous');
    expect(mocks.limit).toHaveBeenCalledTimes(1);
  });

  it('rate limits Supabase-cookie-looking reads until route auth validates them', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.limit.mockResolvedValueOnce({
      success: false,
      limit: 20,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const response = await guardApiProxyRequest(
      makeRequest('/api/v1/users/me/profile', 'GET', {
        cookie:
          'sb-resolved-kingfish-21146-auth-token.0=base64-validvalue; theme=dark',
      }),
      { prefixBase: 'proxy:test:api' }
    );

    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-RateLimit-Caller-Class')).toBe('anonymous');
    expect(mocks.limit).toHaveBeenCalledTimes(1);
  });

  it('rate limits server-url Supabase-cookie-looking reads until route auth validates them', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:8001');
    vi.stubEnv('SUPABASE_SERVER_URL', 'http://host.docker.internal:8001/');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.limit.mockResolvedValueOnce({
      success: false,
      limit: 20,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const response = await guardApiProxyRequest(
      makeRequest('/api/v1/users/me/configs/demo', 'GET', {
        cookie: 'sb-host-auth-token=base64-validvalue; theme=dark',
      }),
      { prefixBase: 'proxy:test:api' }
    );

    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-RateLimit-Caller-Class')).toBe('anonymous');
    expect(mocks.limit).toHaveBeenCalledTimes(1);
  });

  it('rate limits app-session-cookie-looking satellite traffic until route auth validates it', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.limit.mockResolvedValueOnce({
      success: false,
      limit: 20,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const response = await guardApiProxyRequest(
      makeRequest('/api/v1/workspaces/ws-1/tasks?boardId=board-1', 'GET', {
        cookie: 'tuturuuu_app_session=app-session-token; theme=dark',
      }),
      { prefixBase: 'proxy:tasks:api' }
    );

    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-RateLimit-Caller-Class')).toBe('anonymous');
    expect(mocks.limit).toHaveBeenCalledTimes(1);
  });

  it('does not classify raw app-session cookies as authenticated sessions', async () => {
    const { hasAuthenticatedApiSession } = await import(
      '../api-proxy-guard.js'
    );

    expect(
      hasAuthenticatedApiSession(
        makeRequest('/api/v1/workspaces/ws-1/tasks', 'GET', {
          cookie: 'tuturuuu_app_session=anything; theme=dark',
        })
      )
    ).toBe(false);
  });

  it('enforces anonymous IP blocks for cookie-looking browser requests', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue({
      expiresAt: new Date(Date.now() + 30_000),
      reason: 'api_abuse',
      blockLevel: 1,
      blockedAt: new Date(),
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const response = await guardApiProxyRequest(
      makeRequest('/api/v1/workspaces/ws-1/users/database?page=1', 'GET', {
        cookie:
          'sb-resolved-kingfish-21146-auth-token.0=base64-validvalue; theme=dark',
      }),
      { prefixBase: 'proxy:test:api' }
    );

    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-Proxy-Block-Reason')).toBe(
      'ip-already-blocked'
    );
    expect(mocks.limit).not.toHaveBeenCalled();
  });

  it('shares broad anonymous read buckets across path variants', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.limit.mockResolvedValue({
      success: true,
      limit: 20,
      remaining: 19,
      reset: Date.now() + 60_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    await guardApiProxyRequest(makeRequest('/api/v1/users/me/profile', 'GET'), {
      prefixBase: 'proxy:test:api',
    });
    await guardApiProxyRequest(
      makeRequest('/api/v1/users/me/nonexistent/random-nonce', 'GET'),
      {
        prefixBase: 'proxy:test:api',
      }
    );

    expect(mocks.ratelimitPrefixes).toContain(
      'proxy:test:api:users-me:anonymous:get:minute'
    );
    expect(mocks.ratelimitPrefixes).not.toContain(
      'proxy:test:api:users-me:anonymous::api:v1:users:me:profile:get:minute'
    );
    expect(mocks.ratelimitPrefixes).not.toContain(
      'proxy:test:api:users-me:anonymous::api:v1:users:me:nonexistent:random-nonce:get:minute'
    );
  });

  it.each([
    '/api/v1/auth/otp/send',
    '/api/v1/auth/mobile/send-otp',
  ])('uses a classroom-friendly OTP send bucket for %s', async (path) => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.limit.mockResolvedValueOnce({
      success: false,
      limit: 30,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const response = await guardApiProxyRequest(makeRequest(path, 'POST'), {
      prefixBase: 'proxy:test:api',
    });

    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-RateLimit-Limit')).toBe('30');
    expect(response?.headers.get('X-RateLimit-Policy')).toBe('otp-send');
  });

  it('uses a classroom-friendly bucket for cross-app return handoffs', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.limit.mockResolvedValueOnce({
      success: false,
      limit: 180,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const response = await guardApiProxyRequest(
      makeRequest('/api/v1/auth/cross-app-return', 'POST'),
      {
        prefixBase: 'proxy:test:api',
      }
    );

    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-RateLimit-Limit')).toBe('180');
    expect(response?.headers.get('X-RateLimit-Policy')).toBe(
      'cross-app-return'
    );
  });

  it('uses a separate OTP verify bucket', async () => {
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
      makeRequest('/api/v1/auth/mobile/verify-otp', 'POST'),
      { prefixBase: 'proxy:test:api' }
    );

    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-RateLimit-Limit')).toBe('60');
    expect(response?.headers.get('X-RateLimit-Policy')).toBe('otp-verify');
  });

  it('uses a separate classroom-friendly password-login bucket', async () => {
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
      makeRequest('/api/v1/auth/password-login', 'POST'),
      { prefixBase: 'proxy:test:api' }
    );

    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-RateLimit-Limit')).toBe('60');
    expect(response?.headers.get('X-RateLimit-Policy')).toBe('password-login');
  });

  it('keeps password login, OTP send, and OTP verify on distinct limiter prefixes', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.limit.mockResolvedValue({
      success: true,
      limit: 60,
      remaining: 59,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    await guardApiProxyRequest(makeRequest('/api/v1/auth/password-login'), {
      prefixBase: 'proxy:test:api',
    });
    await guardApiProxyRequest(makeRequest('/api/v1/auth/otp/send'), {
      prefixBase: 'proxy:test:api',
    });
    await guardApiProxyRequest(makeRequest('/api/v1/auth/otp/verify'), {
      prefixBase: 'proxy:test:api',
    });

    expect(mocks.ratelimitPrefixes).toContain(
      'proxy:test:api:password-login:anonymous:mutate:minute'
    );
    expect(mocks.ratelimitPrefixes).toContain(
      'proxy:test:api:otp-send:anonymous:mutate:minute'
    );
    expect(mocks.ratelimitPrefixes).toContain(
      'proxy:test:api:otp-verify:anonymous:mutate:minute'
    );
    expect(mocks.ratelimitPrefixes).not.toContain(
      'proxy:test:api:auth:anonymous:mutate:minute'
    );
  });

  it('honors auth-specific proxy limit environment overrides', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    vi.stubEnv('API_PROXY_PASSWORD_LOGIN_LIMIT_MINUTE', '75');
    vi.stubEnv('API_PROXY_OTP_SEND_LIMIT_MINUTE', '45');
    vi.stubEnv('API_PROXY_OTP_VERIFY_LIMIT_MINUTE', '90');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.limit.mockResolvedValue({
      success: true,
      limit: 75,
      remaining: 74,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    await guardApiProxyRequest(makeRequest('/api/v1/auth/password-login'), {
      prefixBase: 'proxy:test:api',
    });
    await guardApiProxyRequest(makeRequest('/api/v1/auth/otp/send'), {
      prefixBase: 'proxy:test:api',
    });
    await guardApiProxyRequest(makeRequest('/api/v1/auth/otp/verify'), {
      prefixBase: 'proxy:test:api',
    });

    expect(mocks.ratelimitConfigs).toContainEqual({
      limit: 75,
      window: '1 m',
    });
    expect(mocks.ratelimitConfigs).toContainEqual({
      limit: 45,
      window: '1 m',
    });
    expect(mocks.ratelimitConfigs).toContainEqual({
      limit: 90,
      window: '1 m',
    });
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

  it('prepends additional route policies before default high-fanout buckets', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.limit.mockResolvedValueOnce({
      success: false,
      limit: 30,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const response = await guardApiProxyRequest(
      makeRequest('/api/v1/workspaces/ws-1/mail/send', 'POST'),
      {
        additionalRoutePolicies: [
          {
            key: 'email-rate-limit-override',
            matches: (req) =>
              /^\/api\/v1\/workspaces\/[^/]+\/mail\/send(?:\/|$)/.test(
                req.nextUrl.pathname
              ),
            rateLimits: {
              get: [],
              mutate: [{ duration: '1 m', limit: 30, window: 'minute' }],
            },
          },
        ],
        prefixBase: 'proxy:test:api',
      }
    );

    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-RateLimit-Limit')).toBe('30');
    expect(response?.headers.get('X-RateLimit-Policy')).toBe(
      'email-rate-limit-override'
    );
    expect(mocks.ratelimitConfigs).toContainEqual({
      limit: 30,
      window: '1 m',
    });
    expect(mocks.ratelimitConfigs).not.toContainEqual({
      limit: 2,
      window: '1 m',
    });
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

  it('uses a larger anonymous default mutation burst budget per minute', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.limit.mockResolvedValue({
      success: true,
      limit: 30,
      remaining: 29,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    await guardApiProxyRequest(
      makeRequest('/api/v1/workspaces/ws-1/tasks/task-1', 'PUT'),
      { prefixBase: 'proxy:test:api' }
    );

    expect(mocks.ratelimitConfigs).toContainEqual({
      limit: 30,
      window: '1 m',
    });
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
    expect(blockedResponse?.headers.get('X-RateLimit-Policy')).toBe('cron');
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

  it('gives a trusted session its own per-session bucket with scaled read limits', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    // Trust the session subject key (account trust → per-session keying).
    mocks.getTrustEntries.mockImplementation((keys: string[]) => {
      const map = new Map<string, { m: number }>();
      const sessionKey = keys.find((key) => key.startsWith('session:'));
      if (sessionKey) {
        map.set(sessionKey, { m: 3 });
      }
      return Promise.resolve(map);
    });
    mocks.limit.mockResolvedValueOnce({
      success: false,
      limit: 1800,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const response = await guardApiProxyRequest(
      makeRequest('/api/v1/workspaces/ws-1/tasks?boardId=board-1', 'GET', {
        cookie:
          'sb-resolved-kingfish-21146-auth-token.0=base64-validvalue; theme=dark',
      }),
      { prefixBase: 'proxy:test:api' }
    );

    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-RateLimit-Policy')).toBe('task-board-read');
    // Base task-board read minute limit (600) scaled by the trust tier (3).
    expect(mocks.ratelimitConfigs).toContainEqual({
      limit: 1800,
      window: '1 m',
    });
    // Trusted traffic gets an authenticated, tier-suffixed bucket.
    expect(mocks.ratelimitPrefixes).toContain(
      'proxy:test:api:task-board-read:authenticated:t3:get:minute'
    );
    // The limiter is keyed by the per-session subject key, not the shared IP.
    const limiterId = mocks.limit.mock.calls[0]?.[0] as string;
    expect(limiterId.startsWith('session:')).toBe(true);
  });

  it('keeps trusted-session mutation limits flat while using the session bucket', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.getTrustEntries.mockImplementation((keys: string[]) => {
      const map = new Map<string, { m: number }>();
      const sessionKey = keys.find((key) => key.startsWith('session:'));
      if (sessionKey) {
        map.set(sessionKey, { m: 3 });
      }
      return Promise.resolve(map);
    });
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
      makeRequest(
        '/api/v1/workspaces/071e0fc7-9aa8-42d8-92e5-cc9b3aeec2f1/calendar/events/68e18a3a-c527-421e-8ac3-f8b846175622',
        'DELETE',
        {
          cookie:
            'sb-resolved-kingfish-21146-auth-token.0=base64-validvalue; theme=dark',
        }
      ),
      { prefixBase: 'proxy:test:api' }
    );

    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-RateLimit-Caller-Class')).toBe(
      'authenticated'
    );
    expect(response?.headers.get('X-RateLimit-Limit')).toBe('60');
    expect(mocks.ratelimitConfigs).toContainEqual({
      limit: 60,
      window: '1 m',
    });
    expect(mocks.ratelimitPrefixes).toContain(
      'proxy:test:api:default:authenticated:mutate:minute'
    );
    expect(mocks.ratelimitPrefixes).not.toContain(
      'proxy:test:api:default:authenticated:t3:mutate:minute'
    );
    const limiterId = mocks.limit.mock.calls[0]?.[0] as string;
    expect(limiterId.startsWith('session:')).toBe(true);
  });

  it('uplifts a trusted location per-IP without per-session keying', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    // Trust the location (cidr) subject key only — no session cookie present.
    mocks.getTrustEntries.mockImplementation((keys: string[]) => {
      const map = new Map<string, { m: number }>();
      const cidrKey = keys.find((key) => key.startsWith('cidr:'));
      if (cidrKey) {
        map.set(cidrKey, { m: 2 });
      }
      return Promise.resolve(map);
    });
    mocks.limit.mockResolvedValueOnce({
      success: false,
      limit: 1200,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const response = await guardApiProxyRequest(
      makeRequest('/api/v1/workspaces/ws-1/tasks?boardId=board-1', 'GET'),
      { prefixBase: 'proxy:test:api' }
    );

    expect(response?.status).toBe(429);
    expect(mocks.ratelimitConfigs).toContainEqual({
      limit: 1200,
      window: '1 m',
    });
    expect(mocks.ratelimitPrefixes).toContain(
      'proxy:test:api:task-board-read:anonymous:t2:get:minute'
    );
    // Location trust keeps the shared per-IP bucket (whole team benefits).
    expect(mocks.limit).toHaveBeenCalledWith('ip:1.2.3.4');
  });

  it('does not apply trusted-location read uplift to mutations', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    const receivedKeys: string[] = [];
    mocks.getTrustEntries.mockImplementation((keys: string[]) => {
      receivedKeys.push(...keys);
      const map = new Map<string, { m: number }>();
      const cidrKey = keys.find((key) => key.startsWith('cidr:'));
      if (cidrKey) {
        map.set(cidrKey, { m: 2 });
      }
      return Promise.resolve(map);
    });
    mocks.limit.mockResolvedValueOnce({
      success: false,
      limit: 30,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const response = await guardApiProxyRequest(
      makeRequest('/api/v1/workspaces/ws-1/tasks', 'POST'),
      { prefixBase: 'proxy:test:api' }
    );

    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-RateLimit-Caller-Class')).toBe('anonymous');
    expect(response?.headers.get('X-RateLimit-Limit')).toBe('30');
    expect(mocks.ratelimitConfigs).toContainEqual({
      limit: 30,
      window: '1 m',
    });
    expect(mocks.ratelimitPrefixes).toContain(
      'proxy:test:api:default:anonymous:mutate:minute'
    );
    expect(mocks.ratelimitPrefixes).not.toContain(
      'proxy:test:api:default:anonymous:t2:mutate:minute'
    );
    expect(receivedKeys.some((key) => key.startsWith('cidr:'))).toBe(false);
    expect(mocks.limit).toHaveBeenCalledWith('ip:1.2.3.4');
  });

  it('keeps a trusted location on per-IP keying even with an untrusted session cookie', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    // Only the cidr is trusted; the session key is absent from the cache.
    mocks.getTrustEntries.mockImplementation((keys: string[]) => {
      const map = new Map<string, { m: number }>();
      const cidrKey = keys.find((key) => key.startsWith('cidr:'));
      if (cidrKey) {
        map.set(cidrKey, { m: 2 });
      }
      return Promise.resolve(map);
    });
    mocks.limit.mockResolvedValueOnce({
      success: false,
      limit: 1200,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    await guardApiProxyRequest(
      makeRequest('/api/v1/workspaces/ws-1/tasks?boardId=board-1', 'GET', {
        cookie:
          'sb-resolved-kingfish-21146-auth-token.0=base64-validvalue; theme=dark',
      }),
      { prefixBase: 'proxy:test:api' }
    );

    // An untrusted session must not escape the per-IP bucket.
    expect(mocks.limit).toHaveBeenCalledWith('ip:1.2.3.4');
  });

  it('keeps untrusted reads on the legacy per-IP bucket without trust suffix', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    // Default mock: empty trust map (forged or simply untrusted).
    mocks.limit.mockResolvedValueOnce({
      success: false,
      limit: 600,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const response = await guardApiProxyRequest(
      makeRequest('/api/v1/workspaces/ws-1/tasks?boardId=board-1', 'GET', {
        cookie:
          'sb-resolved-kingfish-21146-auth-token.0=forged-value; theme=dark',
      }),
      { prefixBase: 'proxy:test:api' }
    );

    expect(response?.status).toBe(429);
    expect(mocks.ratelimitConfigs).toContainEqual({
      limit: 600,
      window: '1 m',
    });
    expect(mocks.ratelimitPrefixes).toContain(
      'proxy:test:api:task-board-read:anonymous:get:minute'
    );
    expect(mocks.limit).toHaveBeenCalledWith('ip:1.2.3.4');
  });

  it('applies an absolute read limit from a location rule', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.getTrustEntries.mockImplementation((keys: string[]) => {
      const map = new Map<string, unknown>();
      const cidrKey = keys.find((key) => key.startsWith('cidr:'));
      if (cidrKey) {
        map.set(cidrKey, { abs: { minute: 50 }, m: 1, mode: 'absolute' });
      }
      return Promise.resolve(map);
    });
    mocks.limit.mockResolvedValueOnce({
      success: false,
      limit: 50,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const response = await guardApiProxyRequest(
      makeRequest('/api/v1/workspaces/ws-1/tasks?boardId=board-1', 'GET'),
      { prefixBase: 'proxy:test:api' }
    );

    expect(response?.status).toBe(429);
    // Absolute exactly sets the minute window (even below the base 600).
    expect(mocks.ratelimitConfigs).toContainEqual({ limit: 50, window: '1 m' });
    expect(mocks.ratelimitPrefixes).toContain(
      'proxy:test:api:task-board-read:anonymous:abs-50-x-x:get:minute'
    );
    expect(mocks.limit).toHaveBeenCalledWith('ip:1.2.3.4');
  });

  it('removes the read cap for an unlimited rule', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.getTrustEntries.mockImplementation((keys: string[]) => {
      const map = new Map<string, unknown>();
      const cidrKey = keys.find((key) => key.startsWith('cidr:'));
      if (cidrKey) {
        map.set(cidrKey, { m: 1, mode: 'unlimited' });
      }
      return Promise.resolve(map);
    });
    mocks.validateEmoji.mockResolvedValue(null);

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const response = await guardApiProxyRequest(
      makeRequest('/api/v1/workspaces/ws-1/tasks?boardId=board-1', 'GET'),
      { prefixBase: 'proxy:test:api' }
    );

    // No read limiter is constructed → request passes the rate-limit stage.
    expect(response).toBeNull();
    expect(mocks.limit).not.toHaveBeenCalled();
  });

  it('uplifts reads for a trusted workspace parsed from the path', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    const receivedKeys: string[] = [];
    mocks.getTrustEntries.mockImplementation((keys: string[]) => {
      receivedKeys.push(...keys);
      const map = new Map<string, unknown>();
      const workspaceKey = keys.find((key) => key.startsWith('workspace:'));
      if (workspaceKey) {
        map.set(workspaceKey, { m: 5 });
      }
      return Promise.resolve(map);
    });
    mocks.limit.mockResolvedValueOnce({
      success: false,
      limit: 3000,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const wsId = '33333333-3333-4333-8333-333333333333';
    const response = await guardApiProxyRequest(
      makeRequest(`/api/v1/workspaces/${wsId}/tasks?boardId=board-1`, 'GET'),
      { prefixBase: 'proxy:test:api' }
    );

    expect(response?.status).toBe(429);
    expect(receivedKeys).toContain(`workspace:${wsId}`);
    // Base task-board minute (600) scaled by the workspace tier (5).
    expect(mocks.ratelimitConfigs).toContainEqual({
      limit: 3000,
      window: '1 m',
    });
    expect(mocks.ratelimitPrefixes).toContain(
      'proxy:test:api:task-board-read:anonymous:t5:get:minute'
    );
  });

  it('derives the session subject key the same way as server-side reputation', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    mocks.redis.mockReturnValue({});
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    const receivedKeys: string[] = [];
    mocks.getTrustEntries.mockImplementation((keys: string[]) => {
      receivedKeys.push(...keys);
      return Promise.resolve(new Map<string, { m: number }>());
    });
    mocks.limit.mockResolvedValue({
      success: true,
      limit: 600,
      remaining: 599,
      reset: Date.now() + 15_000,
    });
    mocks.validateEmoji.mockResolvedValue(null);

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    const cookieName = 'sb-resolved-kingfish-21146-auth-token.0';
    const cookieValue = 'base64-validvalue';
    await guardApiProxyRequest(
      makeRequest('/api/v1/workspaces/ws-1/tasks?boardId=board-1', 'GET', {
        cookie: `${cookieName}=${cookieValue}; theme=dark`,
      }),
      { prefixBase: 'proxy:test:api' }
    );

    const { createHash } = await import('node:crypto');
    const expected = `session:${createHash('sha256')
      .update(`${cookieName}:${cookieValue}`)
      .digest('hex')
      .slice(0, 24)}`;

    expect(receivedKeys).toContain(expected);
  });

  it('skips text-bomb validation for whiteboard snapshots on the whiteboard save route', async () => {
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
    mocks.validateEmoji.mockResolvedValue(null);

    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();

    await guardApiProxyRequest(
      makeRequest(
        '/api/v1/workspaces/ws-1/whiteboards/11111111-1111-4111-8111-111111111111',
        'PATCH'
      ),
      { prefixBase: 'proxy:test:api' }
    );

    expect(mocks.validateEmoji).toHaveBeenCalledWith(expect.any(NextRequest), {
      allowDescriptionYjsState: false,
      skipValidationForFields: ['snapshot'],
    });
  });
});
