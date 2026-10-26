import { guardRejection } from '@tuturuuu/utils/guard-rejection';
import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy } from './proxy';

const mocks = vi.hoisted(() => ({
  clearSupabaseAuthCookies: vi.fn(
    (_request: NextRequest, response: NextResponse) => response
  ),
  consumeVerifyTokenRequest: vi.fn(),
  getAppSessionClaimsFromRequest: vi.fn(),
  guardApiProxyRequest: vi.fn(),
  hasAuthenticatedBearerToken: vi.fn(),
  isTrustedProxyBypassRequest: vi.fn(),
  hasSupportedSupabaseAuthCookie: vi.fn(),
  hasWebAppSessionTokenFromRequest: vi.fn(),
  propagateAuthCookies: vi.fn(),
  refreshAppSessionForRequest: vi.fn(),
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  clearSupabaseAuthCookies: (
    ...args: Parameters<typeof mocks.clearSupabaseAuthCookies>
  ) => mocks.clearSupabaseAuthCookies(...args),
  getAppSessionClaimsFromRequest: (
    ...args: Parameters<typeof mocks.getAppSessionClaimsFromRequest>
  ) => mocks.getAppSessionClaimsFromRequest(...args),
  hasSupportedSupabaseAuthCookie: (
    ...args: Parameters<typeof mocks.hasSupportedSupabaseAuthCookie>
  ) => mocks.hasSupportedSupabaseAuthCookie(...args),
  hasWebAppSessionTokenFromRequest: (
    ...args: Parameters<typeof mocks.hasWebAppSessionTokenFromRequest>
  ) => mocks.hasWebAppSessionTokenFromRequest(...args),
}));

vi.mock('@tuturuuu/auth/proxy', async () => ({
  ...(await vi.importActual<
    typeof import('../../../packages/auth/src/proxy/mfa-failure')
  >('../../../packages/auth/src/proxy/mfa-failure')),
  consumeVerifyTokenRequest: (
    ...args: Parameters<typeof mocks.consumeVerifyTokenRequest>
  ) => mocks.consumeVerifyTokenRequest(...args),
  propagateAuthCookies: (
    ...args: Parameters<typeof mocks.propagateAuthCookies>
  ) => mocks.propagateAuthCookies(...args),
  refreshAppSessionForRequest: (
    ...args: Parameters<typeof mocks.refreshAppSessionForRequest>
  ) => mocks.refreshAppSessionForRequest(...args),
}));

vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  isTrustedProxyBypassRequest: (
    ...args: Parameters<typeof mocks.isTrustedProxyBypassRequest>
  ) => mocks.isTrustedProxyBypassRequest(...args),
  guardApiProxyRequest: (
    ...args: Parameters<typeof mocks.guardApiProxyRequest>
  ) => mocks.guardApiProxyRequest(...args),
  hasAuthenticatedBearerToken: (
    ...args: Parameters<typeof mocks.hasAuthenticatedBearerToken>
  ) => mocks.hasAuthenticatedBearerToken(...args),
}));

vi.mock('next-intl/middleware', () => ({
  default: () => () => NextResponse.next(),
}));

vi.mock('next-intl/routing', () => ({
  defineRouting: (config: unknown) => config,
}));

vi.mock('next-intl/navigation', () => ({
  createNavigation: () => ({
    Link: 'a',
    redirect: () => undefined,
    usePathname: () => '/',
    useRouter: () => ({}),
  }),
}));

describe('Infra proxy', () => {
  beforeEach(() => {
    mocks.consumeVerifyTokenRequest.mockResolvedValue(null);
    mocks.guardApiProxyRequest.mockResolvedValue(null);
    mocks.hasAuthenticatedBearerToken.mockReturnValue(false);
    mocks.isTrustedProxyBypassRequest.mockReturnValue(false);
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(false);
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns MFA_REQUIRED while retaining the provider recovery session', async () => {
    const rotated = NextResponse.next();
    rotated.cookies.set('sb-project-auth-token', 'rotated');
    mocks.refreshAppSessionForRequest.mockResolvedValue({
      ok: false,
      error: 'MFA required',
      response: rotated,
    });
    const response = await proxy(
      new NextRequest('https://example.com/api/v1/users/me/profile')
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'MFA_REQUIRED' });
    expect(response.headers.get('set-cookie')).toContain(
      'sb-project-auth-token=rotated'
    );
    expect(mocks.clearSupabaseAuthCookies).not.toHaveBeenCalled();
  });

  it.each([
    [503, 'offline-download-inactive'],
    [503, 'offline-download-unavailable'],
    [429, 'offline-download-rate-limited'],
    [401, 'offline-download-authentication-required'],
    [403, 'offline-download-challenge-required'],
    [503, 'auth-assurance-unavailable'],
    [403, 'auth-assurance-required'],
    [401, 'auth-assurance-unauthenticated'],
    [429, 'proxy-ip-blocked'],
    [429, 'proxy-rate-limited'],
    [413, 'proxy-payload-too-large'],
    [400, 'proxy-content-rejected'],
  ] as const)(
    'preserves %s %s through the mobile gateway middleware',
    async (status, reason) => {
      mocks.hasAuthenticatedBearerToken.mockReturnValue(true);
      const rejected = NextResponse.json(
        { error: 'rejected' },
        {
          status,
          headers: {
            'X-Tuturuuu-Guard-Reason': reason,
            'X-Tuturuuu-Guard-Request-Id': 'synthetic-request-id',
            'Access-Control-Expose-Headers':
              'X-Tuturuuu-Guard-Reason, X-Tuturuuu-Guard-Request-Id',
            'Retry-After': '30',
          },
        }
      );
      mocks.guardApiProxyRequest.mockResolvedValue(rejected);
      const response = await proxy(
        new NextRequest(
          'https://infrastructure.tuturuuu.com/api/v1/mobile-calendar/api/v1/workspaces/private-id/calendar/events',
          { headers: { authorization: 'Bearer eyJnative' } }
        )
      );
      expect(response.status).toBe(status);
      expect(response.headers.get('X-Tuturuuu-Guard-Reason')).toBe(reason);
      expect(response.headers.get('X-Tuturuuu-Guard-Request-Id')).toBe(
        'synthetic-request-id'
      );
      expect(response.headers.get('Access-Control-Expose-Headers')).toContain(
        'X-Tuturuuu-Guard-Reason'
      );
      expect(response.headers.get('Retry-After')).toBe('30');
    }
  );

  it.each([
    ['Account assurance unavailable', 503, 'auth-assurance-unavailable'],
    ['MFA required', 403, 'auth-assurance-required'],
    ['App session refresh unavailable', 503, 'app-session-refresh-unavailable'],
    ['Invalid app session', 401, 'app-session-unauthenticated'],
  ] as const)(
    'labels early session failure %s before the shared guard',
    async (error, status, reason) => {
      mocks.refreshAppSessionForRequest.mockResolvedValue({ ok: false, error });
      const response = await proxy(
        new NextRequest(
          'https://infrastructure.tuturuuu.com/api/v1/mobile-calendar/api/v1/users/calendar-settings'
        )
      );
      expect(response.status).toBe(status);
      expect(response.headers.get('X-Tuturuuu-Guard-Reason')).toBe(reason);
      expect(response.headers.get('Access-Control-Expose-Headers')).toContain(
        'X-Tuturuuu-Guard-Reason'
      );
      expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
    }
  );

  it.each(['users', 'workspaces/private-workspace'])(
    'emits only one warning for a rejected %s calendar preference read',
    async (subject) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const request = new NextRequest(
        `https://infrastructure.tuturuuu.com/api/v1/mobile-calendar/api/v1/${subject}/calendar-settings`
      );
      mocks.hasAuthenticatedBearerToken.mockReturnValue(true);
      mocks.guardApiProxyRequest.mockImplementationOnce(() =>
        guardRejection(
          request,
          NextResponse.json({ error: 'Too Many Requests' }, { status: 429 }),
          'proxy-rate-limited'
        )
      );
      try {
        const response = await proxy(request);
        expect(response.status).toBe(429);
        expect(warn).toHaveBeenCalledExactlyOnceWith(
          `Guard rejected request ${JSON.stringify({
            reason: 'proxy-rate-limited',
            route: '/api/v1/mobile-calendar/:path*',
            requestId: response.headers.get('X-Tuturuuu-Guard-Request-Id'),
          })}`
        );
      } finally {
        warn.mockRestore();
      }
    }
  );

  it('accepts a trusted scheduler without requiring a browser session', async () => {
    mocks.isTrustedProxyBypassRequest.mockReturnValue(true);
    mocks.refreshAppSessionForRequest.mockResolvedValue({ ok: false });
    const request = new NextRequest(
      'https://infrastructure.tuturuuu.com/api/cron/calendar/provider-sync',
      {
        headers: { authorization: 'Bearer scheduler-test-secret' },
      }
    );
    const response = await proxy(request);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
    expect(mocks.isTrustedProxyBypassRequest).toHaveBeenCalledWith(
      request.nextUrl.pathname,
      request.headers
    );
    expect(mocks.guardApiProxyRequest).toHaveBeenCalled();
  });

  it.each([
    '/api/cron/calendar/provider-sync',
    '/api/cron/calendar/smart-schedule',
  ])('rejects untrusted scheduler credentials at %s', async (path) => {
    mocks.refreshAppSessionForRequest.mockResolvedValue({ ok: false });
    const response = await proxy(
      new NextRequest(`https://infrastructure.tuturuuu.com${path}`, {
        headers: { authorization: 'Bearer forged-secret' },
      })
    );
    expect(response.status).toBe(401);
    expect(mocks.refreshAppSessionForRequest).toHaveBeenCalled();
  });

  it('does not apply scheduler trust outside cron routes', async () => {
    mocks.isTrustedProxyBypassRequest.mockReturnValue(true);
    mocks.refreshAppSessionForRequest.mockResolvedValue({ ok: false });
    const response = await proxy(
      new NextRequest('https://infrastructure.tuturuuu.com/api/v1/workspaces')
    );
    expect(response.status).toBe(401);
    expect(mocks.isTrustedProxyBypassRequest).not.toHaveBeenCalled();
  });

  it('refreshes protected API requests for the infra app before web proxy fallback', async () => {
    mocks.refreshAppSessionForRequest.mockResolvedValue({
      ok: true,
      response: NextResponse.next(),
    });

    const request = new NextRequest(
      'https://infra.tuturuuu.localhost/api/v1/infrastructure/monitoring/cron'
    );

    const response = await proxy(request);

    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(mocks.refreshAppSessionForRequest).toHaveBeenCalledWith(request, {
      sessionMode: 'supabase-first',
      targetApp: 'infra',
    });
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledWith(request, {
      prefixBase: 'proxy:infra:api',
    });
  });

  it('guards local auth API routes without refreshing an app session first', async () => {
    const guardResponse = NextResponse.json(
      { error: 'Payload Too Large' },
      { status: 413 }
    );
    mocks.guardApiProxyRequest.mockResolvedValue(guardResponse);

    const request = new NextRequest(
      'https://infra.tuturuuu.localhost/api/auth/verify-app-token',
      {
        body: '{}',
        headers: { 'content-length': '524289' },
        method: 'POST',
      }
    );

    const response = await proxy(request);

    expect(response.status).toBe(413);
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledWith(request, {
      prefixBase: 'proxy:infra:api',
    });
  });

  it.each(['GET', 'PATCH'])(
    'uses verified actor keying for native preference %s only',
    async (method) => {
      mocks.hasAuthenticatedBearerToken.mockReturnValue(true);
      const request = new NextRequest(
        'https://infrastructure.tuturuuu.com/api/v1/mobile-calendar/api/v1/users/calendar-settings',
        { method, headers: { authorization: 'Bearer eyJnative' } }
      );
      await proxy(request);
      expect(mocks.guardApiProxyRequest).toHaveBeenCalledWith(request, {
        prefixBase: 'proxy:infra:calendar-preferences',
        useVerifiedBearerActor: true,
        diagnosticPolicyName: 'native-calendar-preferences',
      });
    }
  );

  it('redirects unauthenticated pages to the infra login page', async () => {
    mocks.getAppSessionClaimsFromRequest.mockReturnValue(null);
    mocks.refreshAppSessionForRequest.mockResolvedValue({
      error: 'Missing app session',
      ok: false,
    });

    const request = new NextRequest(
      'https://infra.tuturuuu.localhost/personal'
    );

    const response = await proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://infra.tuturuuu.localhost/login?next=%2Fpersonal'
    );
    expect(mocks.refreshAppSessionForRequest).toHaveBeenCalledWith(request, {
      requireWebAppSession: true,
      sessionMode: 'supabase-first',
      targetApp: 'infra',
    });
  });

  it('keeps unlocalized public login paths canonical', async () => {
    const request = new NextRequest(
      'https://infrastructure.tuturuuu.com/login?next=%2F'
    );

    const response = await proxy(request);

    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('location')).toBeNull();
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
  });

  it('canonicalizes localized public login paths to unlocalized login', async () => {
    const request = new NextRequest(
      'https://infrastructure.tuturuuu.com/en/login?next=%2F'
    );

    const response = await proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://infrastructure.tuturuuu.com/login?next=%2F'
    );
    expect(response.cookies.get('NEXT_LOCALE')?.value).toBe('en');
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
  });

  it('canonicalizes localized protected paths before an app session refresh', async () => {
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(true);
    mocks.refreshAppSessionForRequest.mockResolvedValue({
      claims: { app: 'infra' },
      ok: true,
      response: NextResponse.next(),
    });

    const request = new NextRequest('https://infrastructure.tuturuuu.com/en');

    const response = await proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://infrastructure.tuturuuu.com/'
    );
    expect(response.cookies.get('NEXT_LOCALE')?.value).toBe('en');
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
  });

  it('canonicalizes localized internal paths to unlocalized internal paths', async () => {
    const request = new NextRequest(
      'https://infrastructure.tuturuuu.com/en/internal?debug=1'
    );

    const response = await proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://infrastructure.tuturuuu.com/internal?debug=1'
    );
    expect(response.cookies.get('NEXT_LOCALE')?.value).toBe('en');
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
  });

  it.each([
    [
      'unlocalized',
      'https://infrastructure.tuturuuu.com/verify-token?token=copy-token&nextUrl=%2Fpersonal',
    ],
    [
      'localized',
      'https://infrastructure.tuturuuu.com/en/verify-token?token=copy-token&nextUrl=%2Fpersonal',
    ],
  ])(
    'consumes %s verify-token requests before page auth redirects',
    async (_label, url) => {
      const verifyResponse = NextResponse.redirect(
        'https://infrastructure.tuturuuu.com/personal'
      );
      mocks.consumeVerifyTokenRequest.mockResolvedValue(verifyResponse);

      const request = new NextRequest(url);

      const response = await proxy(request);

      expect(response).toBe(verifyResponse);
      expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
    }
  );
});
