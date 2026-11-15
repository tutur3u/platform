import { NextRequest, NextResponse } from 'next/server';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Drive's canonical origins load from the environment when the proxy module is
// imported, so they are fixed before any import runs.
vi.hoisted(() => {
  vi.stubEnv('DRIVE_APP_URL', 'https://drive.tuturuuu.com');
  vi.stubEnv('TTR_URL', 'https://tuturuuu.com');
  vi.stubEnv('NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN', '');
  vi.stubEnv('TUTURUUU_GATEWAY_ORIGIN_HOSTS', '');
});

const mocks = vi.hoisted(() => ({ workspace: vi.fn() }));

vi.mock('@tuturuuu/auth/app-session', () => ({
  clearSupabaseAuthCookies: (_request: unknown, response: unknown) => response,
  getAppSessionClaimsFromRequest: () => null,
  hasSupportedSupabaseAuthCookie: () => false,
  hasWebAppSessionTokenFromRequest: () => false,
}));
vi.mock('@tuturuuu/auth/proxy', () => ({
  createCentralizedAuthProxy: () => async () => NextResponse.next(),
  consumeVerifyTokenRequest: async () => null,
  getRequestHeadersWithResponseCookies: (request: NextRequest) =>
    request.headers,
  propagateAuthCookies: vi.fn(),
  appSessionFailureResponse: vi.fn(),
  preserveMfaRecoveryCookies: vi.fn(),
  refreshAppSessionForRequest: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  getCurrentUserDefaultWorkspace: mocks.workspace,
  withForwardedInternalApiAuth: (headers: Headers) => headers,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  isPersonalWorkspace: vi.fn(),
}));
vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: vi.fn(),
  hasAuthenticatedBearerToken: () => false,
}));

// Mirrors the stock next-intl middleware: with no valid locale cookie it
// writes a host-only `NEXT_LOCALE` cookie for the resolved locale, with no
// `Secure` attribute.
vi.mock('next-intl/middleware', () => ({
  default:
    ({ defaultLocale }: { defaultLocale: string }) =>
    (request: NextRequest) => {
      const response = NextResponse.next();
      const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value;
      if (cookieLocale !== 'en' && cookieLocale !== 'vi') {
        const [segment] = request.nextUrl.pathname.split('/').filter(Boolean);
        const locale = segment === 'en' || segment === 'vi' ? segment : null;
        response.cookies.set('NEXT_LOCALE', locale ?? defaultLocale, {
          path: '/',
          sameSite: 'lax',
        });
      }
      return response;
    },
}));

import { proxy } from './proxy';

const DRIVE = 'https://drive.tuturuuu.com';

const requestHeaders: [string, Record<string, string>][] = [
  ['the canonical request', {}],
  ['a hostile Host header', { host: 'evil.example' }],
  ['a hostile X-Forwarded-Host header', { 'x-forwarded-host': 'evil.example' }],
  [
    'a hostile Host and X-Forwarded-Host pair',
    {
      host: 'evil.example',
      'x-forwarded-host': 'evil.example',
      'x-forwarded-proto': 'http',
    },
  ],
];

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('Drive NEXT_LOCALE cookie written by next-intl', () => {
  it.each(
    requestHeaders.flatMap(([label, headers]) =>
      [
        ['/', {}, 'en'],
        ['/', { cookie: 'NEXT_LOCALE=xx' }, 'en'],
        ['/vi', {}, 'vi'],
        ['/vi/personal', {}, 'vi'],
      ].map(
        ([path, extra, locale]) =>
          [
            path as string,
            label,
            { ...headers, ...(extra as Record<string, string>) },
            locale as string,
          ] as const
      )
    )
  )(
    'is Secure and host-only on %s for %s',
    async (path, _label, headers, locale) => {
      const response = await proxy(
        new NextRequest(`${DRIVE}${path}`, { headers })
      );
      const setCookies = response.headers.getSetCookie();

      // Anonymous requests receive the locale cookie and no auth cookie.
      expect(setCookies).toHaveLength(1);
      expect(setCookies[0]).toMatch(new RegExp(`^NEXT_LOCALE=${locale};`, 'u'));
      expect(setCookies[0]).toMatch(/;\s*Secure(;|$)/iu);
      expect(setCookies[0]).not.toMatch(/Domain=/iu);
      expect(response.cookies.get('NEXT_LOCALE')).toMatchObject({
        path: '/',
        sameSite: 'lax',
        secure: true,
      });
      expect(mocks.workspace).not.toHaveBeenCalled();
    }
  );

  it('leaves the response untouched when next-intl writes no cookie', async () => {
    const response = await proxy(
      new NextRequest(`${DRIVE}/`, { headers: { cookie: 'NEXT_LOCALE=vi' } })
    );
    expect(response.headers.getSetCookie()).toHaveLength(0);
  });
});
