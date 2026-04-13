import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authProxy: vi.fn(),
  guardApiProxyRequest: vi.fn(),
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  getMalformedSupabaseAuthCookieNames: vi.fn(),
  extractIPFromRequest: vi.fn(),
  isIPBlockedEdge: vi.fn(),
  recordMalformedAuthCookieEdge: vi.fn(),
  isPersonalWorkspace: vi.fn(),
  getUserDefaultWorkspace: vi.fn(),
}));

vi.mock('@tuturuuu/auth/proxy', () => ({
  createCentralizedAuthProxy: () => mocks.authProxy,
  propagateAuthCookies: vi.fn(),
}));

vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: (
    ...args: Parameters<typeof mocks.guardApiProxyRequest>
  ) => mocks.guardApiProxyRequest(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
}));

vi.mock('@tuturuuu/supabase/next/proxy', () => ({
  getMalformedSupabaseAuthCookieNames: (
    ...args: Parameters<typeof mocks.getMalformedSupabaseAuthCookieNames>
  ) => mocks.getMalformedSupabaseAuthCookieNames(...args),
}));

vi.mock('@tuturuuu/utils/abuse-protection/edge', () => ({
  extractIPFromRequest: (
    ...args: Parameters<typeof mocks.extractIPFromRequest>
  ) => mocks.extractIPFromRequest(...args),
  isIPBlockedEdge: (...args: Parameters<typeof mocks.isIPBlockedEdge>) =>
    mocks.isIPBlockedEdge(...args),
  recordMalformedAuthCookieEdge: (
    ...args: Parameters<typeof mocks.recordMalformedAuthCookieEdge>
  ) => mocks.recordMalformedAuthCookieEdge(...args),
  blockIPEdge: vi.fn(),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  isPersonalWorkspace: (
    ...args: Parameters<typeof mocks.isPersonalWorkspace>
  ) => mocks.isPersonalWorkspace(...args),
}));

vi.mock('@tuturuuu/utils/user-helper', () => ({
  getUserDefaultWorkspace: (
    ...args: Parameters<typeof mocks.getUserDefaultWorkspace>
  ) => mocks.getUserDefaultWorkspace(...args),
}));

describe('web proxy api handling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date());
    vi.resetModules();
    vi.clearAllMocks();
    mocks.authProxy.mockResolvedValue(NextResponse.next());
    mocks.guardApiProxyRequest.mockResolvedValue(null);
    mocks.createAdminClient.mockRejectedValue(new Error('not configured'));
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    });
    mocks.getMalformedSupabaseAuthCookieNames.mockReturnValue([]);
    mocks.extractIPFromRequest.mockReturnValue('203.0.113.10');
    mocks.isIPBlockedEdge.mockResolvedValue(null);
    mocks.recordMalformedAuthCookieEdge.mockResolvedValue(null);
    mocks.isPersonalWorkspace.mockResolvedValue(false);
    mocks.getUserDefaultWorkspace.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns proxy guard responses for API requests before auth', async () => {
    const guardResponse = NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429 }
    );
    mocks.guardApiProxyRequest.mockResolvedValue(guardResponse);

    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest('http://localhost/api/v1/auth/mobile/send-otp', {
        method: 'POST',
        body: '{}',
      })
    );

    expect(response).toBe(guardResponse);
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledWith(
      expect.any(NextRequest),
      { prefixBase: 'proxy:web:api' }
    );
    expect(mocks.authProxy).not.toHaveBeenCalled();
  });

  it('passes clean API requests through without invoking auth flow', async () => {
    mocks.guardApiProxyRequest.mockResolvedValue(null);

    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest('http://localhost/api/v1/users/me/configs/demo', {
        method: 'GET',
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledTimes(1);
    expect(mocks.authProxy).not.toHaveBeenCalled();
  });

  it('blocks malformed Supabase auth cookies at the API proxy layer', async () => {
    mocks.getMalformedSupabaseAuthCookieNames.mockReturnValue([
      'sb-test-auth-token',
    ]);

    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest('http://localhost/api/v1/users/me/configs/demo', {
        method: 'GET',
      })
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('X-Proxy-Block-Reason')).toBe(
      'malformed-supabase-auth-cookie'
    );
    expect(response.cookies.get('sb-test-auth-token')?.value).toBe('');
    expect(mocks.recordMalformedAuthCookieEdge).toHaveBeenCalledWith(
      '203.0.113.10'
    );
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
    expect(mocks.authProxy).not.toHaveBeenCalled();
  });

  it('escalates repeated malformed-cookie traffic into an IP block', async () => {
    const now = new Date(Date.now());

    mocks.getMalformedSupabaseAuthCookieNames.mockReturnValue([
      'sb-test-auth-token',
    ]);
    mocks.recordMalformedAuthCookieEdge.mockResolvedValue({
      id: 'block-1',
      blockLevel: 1,
      reason: 'api_abuse',
      blockedAt: now,
      expiresAt: new Date(Date.now() + 300_000),
    });

    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest('http://localhost/api/v1/users/me/configs/demo', {
        method: 'GET',
      })
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('X-Proxy-Block-Reason')).toBe(
      'malformed-supabase-auth-cookie-ip-blocked'
    );
    expect(response.headers.get('Retry-After')).not.toBeNull();
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
  });

  it('does not block bearer-token API requests with malformed browser cookies', async () => {
    mocks.getMalformedSupabaseAuthCookieNames.mockReturnValue([
      'sb-test-auth-token',
    ]);

    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest('http://localhost/api/v1/users/me/configs/demo', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer valid-access-token',
        },
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledTimes(1);
    expect(mocks.authProxy).not.toHaveBeenCalled();
  });

  it('ignores reserved tilde workspace API segments before UUID-backed workspace checks', async () => {
    mocks.guardApiProxyRequest.mockResolvedValue(null);

    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest('http://localhost/api/v1/workspaces/~/mail/send', {
        method: 'POST',
        body: '{}',
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledTimes(1);
    expect(mocks.authProxy).not.toHaveBeenCalled();
  });

  it('bypasses auth and locale rewriting for the offline fallback route', async () => {
    const { proxy } = await import('../proxy');
    const response = await proxy(new NextRequest('http://localhost/~offline'));

    expect(response.status).toBe(200);
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
    expect(mocks.authProxy).not.toHaveBeenCalled();
  });

  it('redirects localized offline fallback requests to the canonical route', async () => {
    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest('http://localhost/en/~offline?retry=1')
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost/~offline?retry=1'
    );
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
    expect(mocks.authProxy).not.toHaveBeenCalled();
  });

  it('bypasses auth and locale rewriting for reserved root tilde routes', async () => {
    const { proxy } = await import('../proxy');
    const response = await proxy(new NextRequest('http://localhost/~'));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'http://localhost/__reserved-root-not-found__'
    );
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
    expect(mocks.authProxy).not.toHaveBeenCalled();
  });

  it('redirects localized reserved tilde routes to the canonical root path', async () => {
    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest('http://localhost/en/~unknown?retry=1')
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost/~unknown?retry=1'
    );
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
    expect(mocks.authProxy).not.toHaveBeenCalled();
  });

  it('redirects localized bare tilde routes before they can fall through to workspace resolution', async () => {
    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest('http://localhost/en/~?retry=1')
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/~?retry=1');
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
    expect(mocks.authProxy).not.toHaveBeenCalled();
  });

  it('falls back to the default locale when accept-language contains invalid values', async () => {
    mocks.authProxy.mockResolvedValue(NextResponse.next());

    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest('http://localhost/login', {
        headers: {
          'accept-language': '*,not-a_locale,en;q=0.8',
        },
      })
    );

    expect(response).toBeInstanceOf(NextResponse);
  });

  it('excludes audio assets from the proxy matcher so public media is served directly', async () => {
    const { config } = await import('../proxy');

    expect(config.matcher).toContain(
      '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|site.webmanifest|manifest.webmanifest|sw.js|serwist|monitoring|\\.well-known|.*\\.(?:svg|png|jpg|jpeg|mp3|wav|ogg|m4a|pdf|gif|webp)$).*)'
    );
  });
});
