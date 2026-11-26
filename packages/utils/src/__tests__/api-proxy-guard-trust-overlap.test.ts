import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
  trust: vi.fn(),
  blocked: vi.fn(),
  prefixes: [] as string[],
}));
vi.mock('../offline-download-guard', () => ({
  guardOfflineDownloadRequest: async () => null,
}));
vi.mock('../required-mfa-runtime', () => ({
  enforceRequiredMfaRequest: async () => null,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));
vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class {
    static slidingWindow() {
      return {};
    }
    constructor(config: { prefix: string }) {
      mocks.prefixes.push(config.prefix);
    }
    limit(key: string) {
      return mocks.limit(key);
    }
  },
}));
vi.mock('@upstash/redis', () => ({
  Redis: class {
    static fromEnv() {
      return {};
    }
  },
}));
vi.mock('../abuse-protection/edge', () => ({
  extractIPFromRequest: () => '192.0.2.1',
  isIPBlockedEdge: () => mocks.blocked(),
  readEdgeAbuseProtectionControls: async () => ({
    ipBlockingEnabled: true,
    rateLimitsEnabled: true,
  }),
}));
vi.mock('../abuse-protection/edge-trust', () => ({
  getCachedTrustEntries: (keys: string[]) => mocks.trust(keys),
  hasCachedIpBlockAppealRelief: async () => false,
}));
vi.mock('../request-emoji-limit', () => ({
  validateRequestEmojiLimit: async () => null,
}));

const path = '/api/v1/workspaces/ws-1/tasks';
async function request() {
  const { guardApiProxyRequest } = await import('../api-proxy-guard.js');
  return guardApiProxyRequest(
    new NextRequest(`https://infra.test${path}`, {
      headers: { cookie: 'sb-test-auth-token=synthetic' },
    }),
    { prefixBase: 'proxy:infra:api' }
  );
}

describe('proxy guard trust lookup', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'synthetic');
    vi.stubEnv('API_PROXY_EDGE_TRUST_ENABLED', '1');
    mocks.limit.mockReset().mockResolvedValue({
      success: true,
      limit: 60,
      remaining: 59,
      reset: Date.now() + 30_000,
    });
    mocks.blocked.mockReset().mockResolvedValue(null);
    mocks.trust.mockReset().mockResolvedValue(new Map());
  });
  afterEach(() => vi.unstubAllEnvs());

  it('starts the trust read while the IP block check is pending', async () => {
    let finishBlock: (value: null) => void = () => {};
    mocks.blocked.mockReturnValue(
      new Promise<null>((resolve) => {
        finishBlock = resolve;
      })
    );
    const pending = request();
    await vi.waitFor(() => expect(mocks.trust).toHaveBeenCalledTimes(1));
    expect(mocks.limit).not.toHaveBeenCalled();
    finishBlock(null);
    expect(await pending).toBeNull();
    expect(mocks.limit).toHaveBeenCalled();
  });

  it('answers a blocked IP even when the overlapping trust read fails', async () => {
    mocks.blocked.mockResolvedValue({
      id: 'block-1',
      blockLevel: 1,
      reason: 'api_abuse',
      expiresAt: new Date(Date.now() + 60_000),
      blockedAt: new Date(),
    });
    mocks.trust.mockRejectedValue(new Error('redis unavailable'));
    const response = await request();
    expect(response?.status).toBe(429);
    expect(response?.headers.get('X-Proxy-Block-Reason')).toBe(
      'ip-already-blocked'
    );
    expect(mocks.limit).not.toHaveBeenCalled();
  });
});
