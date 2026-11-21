vi.mock('../required-mfa-runtime', () => ({
  enforceRequiredMfaRequest: async () => null,
}));
vi.mock('../offline-download-guard', () => ({
  guardOfflineDownloadRequest: async () => null,
}));

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRequest } from './api-proxy-test-request';

const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
  extractIp: vi.fn(),
  isBlocked: vi.fn(),
  getTrustEntries: vi.fn(),
}));

vi.mock('@upstash/ratelimit', () => {
  class MockRatelimit {
    static slidingWindow(limit: number, window: string) {
      return { limit, window };
    }
    limit(id: string) {
      return mocks.limit(id);
    }
  }
  return { Ratelimit: MockRatelimit };
});
vi.mock('@upstash/redis', () => ({
  Redis: class MockRedis {
    static fromEnv() {
      return {};
    }
  },
}));
vi.mock('../abuse-protection/edge', () => ({
  extractIPFromRequest: (headers: Headers) => mocks.extractIp(headers),
  isIPBlockedEdge: (ip: string) => mocks.isBlocked(ip),
  readEdgeAbuseProtectionControls: async () => ({
    ipBlockingEnabled: true,
    rateLimitsEnabled: true,
    updatedAt: null,
    updatedBy: null,
  }),
}));
vi.mock('../abuse-protection/edge-trust', () => ({
  getCachedTrustEntries: (keys: string[]) => mocks.getTrustEntries(keys),
  hasCachedIpBlockAppealRelief: async () => false,
}));
vi.mock('../request-emoji-limit', () => ({
  validateRequestEmojiLimit: async () => null,
}));

const EGRESS = '104.22.222.49';
const allowed = { success: true, limit: 60, remaining: 59, reset: 0 };

async function guard(path: string, headers: Record<string, string> = {}) {
  const { guardApiProxyRequest, clearApiProxyGuardLimiterCache } =
    await import('../api-proxy-guard.js');
  clearApiProxyGuardLimiterCache();
  return guardApiProxyRequest(makeRequest(path, 'GET', headers), {
    prefixBase: 'proxy:test:api',
  });
}

describe('guardApiProxyRequest on a shared Cloudflare address', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mocks.limit.mockReset().mockResolvedValue(allowed);
    mocks.isBlocked.mockReset().mockResolvedValue(null);
    mocks.getTrustEntries.mockReset().mockResolvedValue(new Map());
    mocks.extractIp.mockReset().mockReturnValue(EGRESS);
  });

  afterEach(() => vi.unstubAllEnvs());

  it('limits a narrower client key plus the address aggregate, never the shared IP key', async () => {
    expect(await guard('/api/v1/anything', { 'user-agent': 'A' })).toBeNull();
    const limited = mocks.limit.mock.calls.map(([id]) => id as string);
    expect(limited.some((id) => /^egress:104\.22\.222\.49:/u.test(id))).toBe(
      true
    );
    expect(limited).toContain(`egress:${EGRESS}`);
    expect(limited).not.toContain(`ip:${EGRESS}`);
    const lookedUp = mocks.getTrustEntries.mock.calls.flat(2) as string[];
    expect(lookedUp).not.toContain(`ip:${EGRESS}`);
    expect(lookedUp.some((key) => key.startsWith('cidr:'))).toBe(false);
  });

  it('exhausting one client site never limits another', async () => {
    mocks.limit.mockImplementation(async (id: string) =>
      id.startsWith('site:site-a:')
        ? {
            success: false,
            limit: 600,
            remaining: 0,
            reset: Date.now() + 5_000,
          }
        : allowed
    );
    const siteA = await guard(
      '/api/v1/workspaces/site-a/external-projects/delivery'
    );
    const siteB = await guard(
      '/api/v1/workspaces/site-b/external-projects/delivery'
    );
    expect(siteA?.status).toBe(429);
    expect(siteB).toBeNull();
  });

  it('blocks an abusive Worker zone without blocking the shared address', async () => {
    mocks.isBlocked.mockImplementation(async (subject: string) =>
      subject === 'worker:evil.example'
        ? {
            id: 'edge:block',
            blockLevel: 1,
            reason: 'api_abuse',
            blockedAt: new Date(),
            expiresAt: new Date(Date.now() + 60_000),
          }
        : null
    );
    const evil = await guard('/api/v1/anything', {
      'cf-worker': 'evil.example',
    });
    const good = await guard('/api/v1/anything', {
      'cf-worker': 'good.example',
    });
    const plain = await guard('/api/v1/anything', { 'user-agent': 'A' });
    expect(evil?.status).toBe(429);
    expect(evil?.headers.get('X-RateLimit-Policy')).toBe('proxy-ip-block');
    expect(good).toBeNull();
    expect(plain).toBeNull();
    expect(mocks.isBlocked).not.toHaveBeenCalledWith(EGRESS);
  });

  it('does not key or exempt fake app tokens', async () => {
    await guard('/api/v1/anything', { authorization: 'Bearer ttr_one' });
    const limited = mocks.limit.mock.calls.map(([id]) => id as string);
    expect(limited.some((id) => id.startsWith('app:'))).toBe(false);
    expect(limited).toContain(`egress:${EGRESS}`);
  });

  it('keys a visitor address resolved from a valid proof per IP as before', async () => {
    mocks.extractIp.mockReturnValue('203.0.113.42');
    await guard('/api/v1/anything');
    expect(mocks.limit.mock.calls.map(([id]) => id)).toEqual(
      expect.arrayContaining(['ip:203.0.113.42'])
    );
    expect(
      mocks.limit.mock.calls.every(([id]) => id === 'ip:203.0.113.42')
    ).toBe(true);
  });
});
