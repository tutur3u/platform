import type { AppCoordinationTokenClaims } from '@tuturuuu/auth/app-coordination';
import { clearSupabaseAuthCookies } from '@tuturuuu/auth/app-session';
import {
  consumeVerifyTokenRequest,
  refreshAppSessionForRequest,
} from '@tuturuuu/auth/proxy';
import { guardApiProxyRequest } from '@tuturuuu/utils/api-proxy-guard';
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy } from './proxy';

vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: vi.fn(),
}));

vi.mock('@tuturuuu/auth/proxy', () => ({
  consumeVerifyTokenRequest: vi.fn(),
  propagateAuthCookies: vi.fn(),
  refreshAppSessionForRequest: vi.fn(),
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

function appSessionClaims(): AppCoordinationTokenClaims {
  return {
    aud: 'tuturuuu-api',
    email: 'local@tuturuuu.com',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    iss: 'tuturuuu',
    jti: 'jti',
    origin_app: 'web',
    scopes: ['internal-app:session'],
    sub: '00000000-0000-0000-0000-000000000001',
    target_app: 'hive',
    typ: 'app_coordination',
  };
}

describe('Hive proxy auth cookie cleanup', () => {
  beforeEach(() => {
    vi.mocked(guardApiProxyRequest).mockReset();
    vi.mocked(consumeVerifyTokenRequest).mockReset();
    vi.mocked(consumeVerifyTokenRequest).mockResolvedValue(null);
    vi.mocked(refreshAppSessionForRequest).mockReset();
    vi.mocked(refreshAppSessionForRequest).mockResolvedValue({
      claims: {
        aud: 'tuturuuu-api',
        email: 'local@tuturuuu.com',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        iss: 'tuturuuu',
        jti: 'jti',
        origin_app: 'web',
        scopes: ['internal-app:session'],
        sub: '00000000-0000-0000-0000-000000000001',
        target_app: 'hive',
        typ: 'app_coordination',
      },
      ok: true,
      refreshed: false,
      response: NextResponse.next(),
    });
  });

  it('clears stale Supabase auth cookies without touching unrelated cookies', () => {
    const request = new NextRequest('https://hive.tuturuuu.com/dashboard', {
      headers: {
        cookie:
          'tuturuuu_app_session=ttr_app_123; sb-resolved-kingfish-21146-auth-token=stale; sb-resolved-kingfish-21146-auth-token.0=chunk; theme=dark',
      },
    });
    const response = clearSupabaseAuthCookies(request, NextResponse.next());

    expect(
      response.cookies.get('sb-resolved-kingfish-21146-auth-token')?.value
    ).toBe('');
    expect(
      response.cookies.get('sb-resolved-kingfish-21146-auth-token.0')?.value
    ).toBe('');
    expect(response.cookies.get('tuturuuu_app_session')).toBeUndefined();
    expect(response.cookies.get('theme')).toBeUndefined();
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('keeps local logout covered by the generic API guard and clear stale cookies', async () => {
    const request = new NextRequest(
      'https://hive.tuturuuu.com/api/auth/logout',
      {
        headers: {
          cookie:
            'tuturuuu_app_session=ttr_app_123; sb-resolved-kingfish-21146-auth-token=stale',
        },
        method: 'POST',
      }
    );

    const response = await proxy(request);

    expect(guardApiProxyRequest).toHaveBeenCalledTimes(1);
    expect(refreshAppSessionForRequest).not.toHaveBeenCalled();
    expect(response.headers.get('set-cookie')).toContain(
      'sb-resolved-kingfish-21146-auth-token=;'
    );
  });

  it('consumes verify-token requests before public verifier rendering', async () => {
    const verifyResponse = NextResponse.redirect(
      'https://hive.tuturuuu.com/dashboard'
    );
    vi.mocked(consumeVerifyTokenRequest).mockResolvedValueOnce(verifyResponse);
    const request = new NextRequest(
      'https://hive.tuturuuu.com/verify-token?token=copy-token&nextUrl=%2Fdashboard'
    );

    const response = await proxy(request);

    expect(response).toBe(verifyResponse);
    expect(consumeVerifyTokenRequest).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ locales: expect.any(Array) })
    );
    expect(refreshAppSessionForRequest).not.toHaveBeenCalled();
  });

  it('does not redirect unauthenticated users to the internal listener origin', async () => {
    vi.mocked(refreshAppSessionForRequest).mockResolvedValueOnce({
      error: 'Missing app session',
      ok: false,
    });

    const response = await proxy(
      new NextRequest('http://0.0.0.0:7814/dashboard')
    );

    expect(response.headers.get('location')).toBe(
      'https://hive.tuturuuu.localhost/login?next=%2Fdashboard'
    );
  });

  it('sends stale local-only app sessions back through the local login recovery path', async () => {
    vi.mocked(refreshAppSessionForRequest).mockResolvedValueOnce({
      claims: appSessionClaims(),
      ok: true,
      refreshed: false,
      response: NextResponse.next(),
    });
    const response = await proxy(
      new NextRequest('https://hive.tuturuuu.localhost/dashboard')
    );

    expect(response.headers.get('location')).toBe(
      'https://hive.tuturuuu.localhost/login?next=%2Fdashboard'
    );
  });

  it('allows protected pages when both local and Web app-session cookies are present', async () => {
    vi.mocked(refreshAppSessionForRequest).mockResolvedValueOnce({
      claims: appSessionClaims(),
      ok: true,
      refreshed: false,
      response: NextResponse.next(),
    });
    const response = await proxy(
      new NextRequest('https://hive.tuturuuu.localhost/dashboard', {
        headers: {
          cookie: 'tuturuuu_web_app_session=ttr_app_web',
        },
      })
    );

    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('keeps generic API guard coverage for Hive product APIs', async () => {
    vi.mocked(guardApiProxyRequest).mockResolvedValue(null);

    await proxy(
      new NextRequest('https://hive.tuturuuu.com/api/v1/hive/servers')
    );

    expect(guardApiProxyRequest).toHaveBeenCalledTimes(1);
  });
});
