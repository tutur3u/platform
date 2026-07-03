import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  extractIPFromHeaders: vi.fn(),
  getAppealReliefTtlSeconds: vi.fn(),
  getProxySessionSubjectKeyFromCookieHeader: vi.fn(),
  getUpstashRestRedisClient: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
  serverLoggerError: vi.fn(),
  serverLoggerWarn: vi.fn(),
  setCachedIpBlockAppealRelief: vi.fn(),
  verifyTurnstileToken: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: (...args: unknown[]) =>
    mocks.resolveAuthenticatedSessionUser(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: unknown[]) => mocks.createAdminClient(...args),
  createClient: (...args: unknown[]) => mocks.createClient(...args),
}));

vi.mock('@tuturuuu/utils/abuse-protection', () => ({
  extractIPFromHeaders: (...args: unknown[]) =>
    mocks.extractIPFromHeaders(...args),
}));

vi.mock('@tuturuuu/utils/abuse-protection/edge-trust', () => ({
  getAppealReliefTtlSeconds: () => mocks.getAppealReliefTtlSeconds(),
  setCachedIpBlockAppealRelief: (...args: unknown[]) =>
    mocks.setCachedIpBlockAppealRelief(...args),
}));

vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  getProxySessionSubjectKeyFromCookieHeader: (...args: unknown[]) =>
    mocks.getProxySessionSubjectKeyFromCookieHeader(...args),
}));

vi.mock('@tuturuuu/utils/upstash-rest', () => ({
  getUpstashRestRedisClient: (...args: unknown[]) =>
    mocks.getUpstashRestRedisClient(...args),
}));

vi.mock('@tuturuuu/turnstile/server', async () => {
  const actual = await vi.importActual<
    typeof import('@tuturuuu/turnstile/server')
  >('@tuturuuu/turnstile/server');
  return {
    ...actual,
    verifyTurnstileToken: (...args: unknown[]) =>
      mocks.verifyTurnstileToken(...args),
  };
});

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: unknown[]) => mocks.serverLoggerError(...args),
    warn: (...args: unknown[]) => mocks.serverLoggerWarn(...args),
  },
}));

import { POST } from './route';

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/v1/rate-limit-appeals', {
    body: JSON.stringify(body),
    headers: {
      cookie: 'tuturuuu_app_session=session-value',
      'content-type': 'application/json',
    },
    method: 'POST',
  });
}

function createAppealBuilder({
  existingAppeal = null,
  returnedAppeal,
}: {
  existingAppeal?: unknown;
  returnedAppeal: unknown;
}) {
  const builder = {
    eq: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    is: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi
      .fn()
      .mockResolvedValue({ data: existingAppeal, error: null }),
    order: vi.fn(() => builder),
    select: vi.fn(() => builder),
    single: vi.fn().mockResolvedValue({ data: returnedAppeal, error: null }),
    update: vi.fn(() => builder),
  };
  return builder;
}

describe('rate-limit appeal submission route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({});
    mocks.extractIPFromHeaders.mockReturnValue('203.0.113.10');
    mocks.getAppealReliefTtlSeconds.mockReturnValue(900);
    mocks.getProxySessionSubjectKeyFromCookieHeader.mockResolvedValue(
      'session:abc'
    );
    mocks.getUpstashRestRedisClient.mockResolvedValue({
      expire: vi.fn().mockResolvedValue(1),
      incr: vi.fn().mockResolvedValue(1),
      ttl: vi.fn().mockResolvedValue(3600),
    });
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: {
        email: 'member@example.com',
        id: 'user-1',
      },
    });
    mocks.setCachedIpBlockAppealRelief.mockResolvedValue(undefined);
    mocks.verifyTurnstileToken.mockResolvedValue(undefined);
  });

  it('requires authentication', async () => {
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({ user: null });

    const response = await POST(
      makeRequest({
        diagnostics: {},
        turnstileToken: 'captcha-token',
      })
    );

    expect(response.status).toBe(401);
    expect(mocks.verifyTurnstileToken).not.toHaveBeenCalled();
  });

  it('creates an appeal and grants temporary session-IP relief', async () => {
    const appealBuilder = createAppealBuilder({
      returnedAppeal: {
        id: 'appeal-1',
        client_ip: '203.0.113.10',
        status: 'pending',
      },
    });
    mocks.createAdminClient.mockResolvedValue({
      from: vi.fn(() => appealBuilder),
    });

    const response = await POST(
      makeRequest({
        diagnostics: {
          headers: {
            'Retry-After': '32',
            'X-Proxy-Block-Reason': 'ip-already-blocked',
            'X-RateLimit-Policy': 'workspace-dashboard-read',
          },
          request: {
            method: 'GET',
            requestPath:
              '/api/v1/workspaces/42529372-c669-4833-bb32-2cab1f4ffd83/users/groups',
            responseStatus: 429,
          },
        },
        message: 'Legitimate classroom attendance traffic',
        turnstileToken: 'captcha-token',
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.verifyTurnstileToken).toHaveBeenCalledWith(
      expect.any(Request),
      'captcha-token',
      { remoteIp: '203.0.113.10' }
    );
    expect(mocks.setCachedIpBlockAppealRelief).toHaveBeenCalledWith(
      'session:abc',
      'ip:203.0.113.10',
      900
    );
    expect(appealBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        client_ip: '203.0.113.10',
        creator_id: 'user-1',
        proxy_block_reason: 'ip-already-blocked',
        rate_limit_policy: 'workspace-dashboard-read',
        status: 'pending',
        workspace_id: '42529372-c669-4833-bb32-2cab1f4ffd83',
      })
    );
  });

  it('rate-throttles repeated appeal submissions', async () => {
    mocks.getUpstashRestRedisClient.mockResolvedValue({
      expire: vi.fn().mockResolvedValue(1),
      incr: vi.fn().mockResolvedValue(4),
      ttl: vi.fn().mockResolvedValue(120),
    });

    const response = await POST(
      makeRequest({
        diagnostics: {},
        turnstileToken: 'captcha-token',
      })
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('120');
    expect(mocks.setCachedIpBlockAppealRelief).not.toHaveBeenCalled();
  });
});
