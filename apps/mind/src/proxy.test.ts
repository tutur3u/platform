import type { AppCoordinationTokenClaims } from '@tuturuuu/auth/app-coordination';
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
    target_app: 'mind',
    typ: 'app_coordination',
  };
}

describe('Mind proxy verify-token handoff', () => {
  beforeEach(() => {
    vi.mocked(guardApiProxyRequest).mockReset();
    vi.mocked(consumeVerifyTokenRequest).mockReset();
    vi.mocked(consumeVerifyTokenRequest).mockResolvedValue(null);
    vi.mocked(refreshAppSessionForRequest).mockReset();
  });

  it('consumes verify-token requests before public verifier rendering', async () => {
    const verifyResponse = NextResponse.redirect(
      'https://mind.tuturuuu.com/dashboard'
    );
    vi.mocked(consumeVerifyTokenRequest).mockResolvedValueOnce(verifyResponse);
    const request = new NextRequest(
      'https://mind.tuturuuu.com/verify-token?token=copy-token&nextUrl=%2Fdashboard'
    );

    const response = await proxy(request);

    expect(response).toBe(verifyResponse);
    expect(consumeVerifyTokenRequest).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ locales: expect.any(Array) })
    );
    expect(refreshAppSessionForRequest).not.toHaveBeenCalled();
    expect(guardApiProxyRequest).not.toHaveBeenCalled();
  });

  it('sends stale local-only app sessions back through the local login recovery path', async () => {
    vi.mocked(refreshAppSessionForRequest).mockResolvedValueOnce({
      claims: appSessionClaims(),
      ok: true,
      refreshed: false,
      response: NextResponse.next(),
    });
    const request = new NextRequest('https://mind.tuturuuu.localhost/personal');

    const response = await proxy(request);

    expect(response.headers.get('location')).toBe(
      'https://mind.tuturuuu.localhost/login?next=%2Fpersonal'
    );
  });

  it('allows protected pages when both local and Web app-session cookies are present', async () => {
    vi.mocked(refreshAppSessionForRequest).mockResolvedValueOnce({
      claims: appSessionClaims(),
      ok: true,
      refreshed: false,
      response: NextResponse.next(),
    });
    const request = new NextRequest(
      'https://mind.tuturuuu.localhost/personal',
      {
        headers: {
          cookie: 'tuturuuu_web_app_session=ttr_app_web',
        },
      }
    );

    const response = await proxy(request);

    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });
});
