vi.mock('../required-mfa-runtime', () => ({
  enforceRequiredMfaRequest: async () => null,
}));

import type { NextRequest } from 'next/server';
import type { ProxyRoutePolicy } from '../api-proxy-guard';
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

  async function guard(
    routePolicies: ProxyRoutePolicy[] = singleReadRoutePolicies()
  ) {
    const { guardApiProxyRequest } = await import('../api-proxy-guard.js');
    return guardApiProxyRequest(makeRequest('/api/test', 'GET'), {
      prefixBase: 'proxy:test:api',
      routePolicies,
    });
  }

  it('returns the route 429 when the store denies a window', async () => {
    const resetAt = Date.now() + 42_000;
    mocks.hitWindows.mockResolvedValue({
      ok: false,
      resetAt,
      subjectIndex: 0,
      windows: [{ remaining: 0, resetAt }],
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

    // A repeat inside the denied window is answered locally: no store call.
    expect((await guard())?.status).toBe(429);
    expect(mocks.hitWindows).toHaveBeenCalledTimes(1);
  });

  it('charges every window in one operation and reports the denied one', async () => {
    const resetAt = Date.now() + 3_600_000;
    mocks.hitWindows.mockResolvedValue({
      ok: false,
      resetAt,
      subjectIndex: 0,
      windows: [
        { remaining: 3, resetAt: Date.now() + 60_000 },
        { remaining: 0, resetAt },
      ],
    });
    const response = await guard([
      {
        key: 'two-window-test',
        matches: () => true,
        rateLimits: {
          get: [
            { duration: '1 m' as const, limit: 5, window: 'minute' as const },
            { duration: '1 h' as const, limit: 1, window: 'hour' as const },
          ],
          mutate: [],
        },
      },
    ]);
    expect(mocks.hitWindows).toHaveBeenCalledTimes(1);
    expect(mocks.hitWindows.mock.calls[0]?.[0]?.[0]?.windows).toHaveLength(2);
    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-RateLimit-Window')).toBe('hour');
    expect(response?.headers.get('X-RateLimit-Limit')).toBe('1');
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

  it('applies per-instance limits while the store throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.hitWindows.mockRejectedValue(new Error('timeout'));
    await expect(guard()).resolves.toBeNull();
    // The single-read policy allows one request per minute.
    expect((await guard())?.status).toBe(429);
    expect(mocks.limit).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('applies per-instance limits without Upstash when the store is off', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.select.mockReturnValue({ kind: 'off' });
    await expect(guard()).resolves.toBeNull();
    expect((await guard())?.status).toBe(429);
    expect(mocks.hitWindows).not.toHaveBeenCalled();
    expect(mocks.limit).not.toHaveBeenCalled();
    expect(mocks.redis).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
