vi.mock('../required-mfa-runtime', () => ({
  enforceRequiredMfaRequest: async () => null,
}));

import type { NextRequest } from 'next/server';
import { makeRequest } from './api-proxy-test-request';

vi.mock('../offline-download-guard', () => ({
  guardOfflineDownloadRequest: async () => null,
}));

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  hitWindows: vi.fn(),
  limit: vi.fn(),
  ratelimitConfigs: [] as Array<{ limit: number; window: string }>,
  ratelimitPrefixes: [] as string[],
  redis: vi.fn(),
  extractIp: vi.fn(),
  isBlocked: vi.fn(),
  readAbuseProtectionControls: vi.fn(),
  validateEmoji: vi.fn(),
  getTrustEntries: vi.fn(),
  hasAppealRelief: vi.fn(),
}));

vi.mock('../abuse-guard/select', () => ({
  selectAbuseGuard: (family: string) => mocks.select(family),
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
  readEdgeAbuseProtectionControls: () => mocks.readAbuseProtectionControls(),
}));

vi.mock('../abuse-protection/edge-trust', () => ({
  getCachedTrustEntries: (keys: string[]) => mocks.getTrustEntries(keys),
  hasCachedIpBlockAppealRelief: (sessionKey: string, ipKey: string) =>
    mocks.hasAppealRelief(sessionKey, ipKey),
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

describe('guardApiProxyRequest on the abuse-guard store', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    for (const mock of Object.values(mocks)) {
      if (typeof mock === 'function' && 'mockReset' in mock) mock.mockReset();
    }
    mocks.select.mockReturnValue({
      kind: 'durable-object',
      client: { hitWindows: mocks.hitWindows },
    });
    mocks.extractIp.mockReturnValue('1.2.3.4');
    mocks.isBlocked.mockResolvedValue(null);
    mocks.validateEmoji.mockResolvedValue(null);
    mocks.getTrustEntries.mockResolvedValue(new Map());
    mocks.hasAppealRelief.mockResolvedValue(false);
    mocks.readAbuseProtectionControls.mockResolvedValue({
      ipBlockingEnabled: true,
      rateLimitsEnabled: true,
      updatedAt: null,
      updatedBy: null,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function guard() {
    const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
      await import('../api-proxy-guard.js');
    clearApiProxyGuardLimiterCache();
    return guardApiProxyRequest(makeRequest('/api/test', 'GET'), {
      prefixBase: 'proxy:test:api',
      routePolicies: singleReadRoutePolicies(),
    });
  }

  it('returns the route 429 when the store denies a window', async () => {
    mocks.hitWindows.mockResolvedValue({
      ok: false,
      resetAt: Date.now() + 42_000,
      subjectIndex: 0,
    });
    const response = await guard();
    expect(mocks.select).toHaveBeenCalledWith('proxy');
    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-Proxy-Block-Reason')).toBe(
      'route-rate-limit'
    );
    expect(response?.headers.get('X-RateLimit-Limit')).toBe('1');
    expect(response?.headers.get('X-RateLimit-Window')).toBe('minute');
    expect(Number(response?.headers.get('Retry-After'))).toBeGreaterThan(0);
    const [subjects] = mocks.hitWindows.mock.calls[0]!;
    expect(subjects).toEqual([
      {
        partition: expect.stringMatching(/^proxy:test:api.*:get:/u),
        windows: [
          { key: 'minute:1', limit: 1, windowMs: 60_000, algo: 'sliding' },
        ],
      },
    ]);
    expect(mocks.limit).not.toHaveBeenCalled();
    expect(mocks.redis).not.toHaveBeenCalled();
  });

  it('admits a request the store allows', async () => {
    mocks.hitWindows.mockResolvedValue({
      ok: true,
      remaining: 0,
      resetAt: Date.now() + 60_000,
    });
    await expect(guard()).resolves.toBeNull();
    expect(mocks.validateEmoji).toHaveBeenCalled();
  });

  it('keeps the fail-open route policy when the store throws', async () => {
    mocks.hitWindows.mockRejectedValue(new Error('timeout'));
    await expect(guard()).resolves.toBeNull();
    expect(mocks.limit).not.toHaveBeenCalled();
  });

  it('applies no route limits and no fallback when the store is off', async () => {
    mocks.select.mockReturnValue({ kind: 'off' });
    await expect(guard()).resolves.toBeNull();
    expect(mocks.hitWindows).not.toHaveBeenCalled();
    expect(mocks.limit).not.toHaveBeenCalled();
    expect(mocks.redis).not.toHaveBeenCalled();
  });
});
