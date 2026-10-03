import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rest: vi.fn(),
  limiter: vi.fn(),
  limit: vi.fn(),
  verify: vi.fn(),
  mfa: vi.fn(),
  block: vi.fn(),
}));
vi.mock('../required-mfa-runtime', () => ({
  enforceRequiredMfaRequest: mocks.mfa,
}));
vi.mock('../abuse-protection/edge', () => ({
  extractIPFromRequest: () => '192.0.2.1',
  isIPBlockedEdge: mocks.block,
  readEdgeAbuseProtectionControls: async () => ({
    ipBlockingEnabled: true,
    rateLimitsEnabled: false,
  }),
}));
vi.mock('../abuse-protection/edge-trust', () => ({
  getCachedTrustEntries: async () => new Map(),
  hasCachedIpBlockAppealRelief: async () => false,
}));
vi.mock('../upstash-rest', () => ({
  getUpstashRestRedisClient: mocks.rest,
  getUpstashRatelimitRedisClient: mocks.limiter,
}));
vi.mock('@tuturuuu/turnstile/server', () => ({
  verifyTurnstileToken: mocks.verify,
}));
vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class {
    static slidingWindow() {
      return {};
    }
    limit(key: string) {
      return mocks.limit(key);
    }
  },
}));
vi.mock('../request-emoji-limit', () => ({
  validateRequestEmojiLimit: async () => null,
}));

let guardApiProxyRequest: typeof import('../api-proxy-guard')['guardApiProxyRequest'];

import { OFFLINE_DOWNLOAD_HEADER } from '../offline-download-guard';

const paths = [
  ['finance', '/api/workspaces/ws/wallets/infinite'],
  ['inventory', '/api/v1/workspaces/ws/inventory/products'],
  ['contacts', '/api/v1/workspaces/ws/users/database'],
  ['cms', '/api/v1/workspaces/ws/external-projects'],
  ['contacts', '/api/v1/workspaces/ws/members'],
  ['cms', '/api/v1/workspaces/ws/members'],
  ['tasks', '/api/v1/workspaces/ws/tasks'],
] as const;
beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.stubEnv('NODE_ENV', 'production');
  ({ guardApiProxyRequest } = await import('../api-proxy-guard'));
  mocks.mfa.mockResolvedValue(null);
  mocks.block.mockResolvedValue(null);
  mocks.rest.mockRejectedValue(new Error('offline Redis unavailable'));
  mocks.limiter.mockResolvedValue(null);
  mocks.limit.mockResolvedValue({ success: false, reset: Date.now() + 1000 });
  mocks.verify.mockRejectedValue(new Error('Turnstile unavailable'));
});
afterEach(() => vi.unstubAllEnvs());
it.each(paths)(
  'keeps %s ordinary reads independent of optional providers through the real proxy',
  async (app, path) => {
    for (const enabled of ['', 'false', 'true']) {
      vi.stubEnv('OFFLINE_DOWNLOAD_PROTECTION_ENABLED', enabled);
      for (const method of ['GET', 'HEAD']) {
        for (const headers of [
          new Headers(),
          new Headers({ authorization: 'Bearer synthetic-session' }),
          new Headers({ cookie: 'tuturuuu_app_session=ttr_app_synthetic' }),
        ]) {
          const request = new NextRequest(
            `https://${app}.tuturuuu.com${path}`,
            {
              method,
              headers,
            }
          );
          expect(
            await guardApiProxyRequest(request, {
              prefixBase: `proxy:${app}:api`,
            })
          ).toBeNull();
        }
      }
    }
    expect(mocks.rest).not.toHaveBeenCalled();
    expect(mocks.limiter).not.toHaveBeenCalled();
    expect(mocks.limit).not.toHaveBeenCalled();
    expect(mocks.verify).not.toHaveBeenCalled();
  }
);
it('keeps explicit bulk downloads unavailable when the optional provider fails', async () => {
  vi.stubEnv('OFFLINE_DOWNLOAD_PROTECTION_ENABLED', 'true');
  const request = new NextRequest(
    'https://inventory.tuturuuu.com/api/v1/workspaces/ws/inventory/products',
    { headers: { [OFFLINE_DOWNLOAD_HEADER]: '1' } }
  );
  const result = await guardApiProxyRequest(request, {
    prefixBase: 'proxy:inventory:api',
  });
  expect(result?.status).toBe(503);
  expect(result?.headers.get('Retry-After')).toBe('30');
});
it('keeps baseline required MFA and IP blocks effective during offline-provider outages', async () => {
  vi.stubEnv('OFFLINE_DOWNLOAD_PROTECTION_ENABLED', 'true');
  const request = new NextRequest(
    'https://finance.tuturuuu.com/api/workspaces/ws/wallets/infinite'
  );
  mocks.mfa.mockResolvedValue(
    NextResponse.json({ error: 'Required MFA' }, { status: 403 })
  );
  expect(
    (await guardApiProxyRequest(request, { prefixBase: 'proxy:finance:api' }))
      ?.status
  ).toBe(403);
  mocks.mfa.mockResolvedValue(null);
  mocks.block.mockResolvedValue({ expiresAt: new Date(Date.now() + 30000) });
  expect(
    (await guardApiProxyRequest(request, { prefixBase: 'proxy:finance:api' }))
      ?.status
  ).toBe(429);
  expect(mocks.rest).not.toHaveBeenCalled();
});
