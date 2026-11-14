import { NextRequest, NextResponse } from 'next/server';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Chat's canonical origins load from the environment when the proxy module is
// imported, so they are fixed before any import runs.
vi.hoisted(() => {
  vi.stubEnv('CHAT_APP_URL', 'https://chat.tuturuuu.com');
  vi.stubEnv('NEXT_PUBLIC_WEB_APP_URL', 'https://tuturuuu.com');
  vi.stubEnv('NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN', '');
  vi.stubEnv('TUTURUUU_GATEWAY_ORIGIN_HOSTS', '');
});

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('@tuturuuu/auth/proxy', async () => ({
  ...(await vi.importActual<typeof import('@tuturuuu/auth/proxy')>(
    '@tuturuuu/auth/proxy'
  )),
  consumeVerifyTokenRequest: async () => null,
  refreshAppSessionForRequest: mocks.refresh,
}));

// Mirrors the stock next-intl middleware: when the request carries no valid
// locale cookie it writes a host-only `NEXT_LOCALE` cookie derived from the
// request, with no `Secure` attribute.
vi.mock('next-intl/middleware', () => ({
  default: () => (request: NextRequest) => {
    const response = NextResponse.next();
    const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value;
    if (cookieLocale !== 'en' && cookieLocale !== 'vi') {
      const language = request.headers.get('accept-language') ?? '';
      response.cookies.set(
        'NEXT_LOCALE',
        language.startsWith('vi') ? 'vi' : 'en',
        {
          path: '/',
          sameSite: 'lax',
        }
      );
    }
    return response;
  },
}));
vi.mock('next-intl/routing', () => ({
  defineRouting: (config: unknown) => config,
}));
vi.mock('next-intl/navigation', () => ({
  createNavigation: () => ({}),
}));

import { proxy } from './proxy';

const CHAT = 'https://chat.tuturuuu.com';

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

function request(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`${CHAT}${path}`, { headers });
}

function expectLocaleCookieOnly(response: NextResponse) {
  // Anonymous requests receive the locale cookie and no auth cookie.
  const setCookies = response.headers.getSetCookie();
  expect(setCookies).toHaveLength(1);
  expect(setCookies[0]).toMatch(/^NEXT_LOCALE=/u);
  expect(setCookies[0]).toMatch(/;\s*Secure(;|$)/iu);
  expect(setCookies[0]).not.toMatch(/evil\.example/iu);
  return response.cookies.get('NEXT_LOCALE');
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('Chat NEXT_LOCALE cookie written by next-intl', () => {
  it.each(requestHeaders)(
    'is Secure and host-only on /login without Accept-Language for %s',
    async (_label, headers) => {
      const response = await proxy(request('/login', headers));
      const cookie = expectLocaleCookieOnly(response);
      expect(cookie).toMatchObject({
        name: 'NEXT_LOCALE',
        path: '/',
        sameSite: 'lax',
        secure: true,
        value: 'en',
      });
      expect(cookie?.domain).toBeUndefined();
      expect(cookie?.maxAge).toBeUndefined();
    }
  );

  it.each(requestHeaders)(
    'is Secure and host-only on /login with an invalid locale cookie for %s',
    async (_label, headers) => {
      const response = await proxy(
        request('/login', {
          ...headers,
          'accept-language': 'vi',
          cookie: 'NEXT_LOCALE=xx',
        })
      );
      const cookie = expectLocaleCookieOnly(response);
      expect(cookie).toMatchObject({ secure: true, value: 'vi' });
      expect(cookie?.domain).toBeUndefined();
    }
  );

  it('leaves the response untouched when next-intl writes no cookie', async () => {
    const response = await proxy(
      request('/login', { cookie: 'NEXT_LOCALE=vi' })
    );
    expect(response.headers.getSetCookie()).toHaveLength(0);
  });
});

describe('Chat NEXT_LOCALE cookie on the locale redirect', () => {
  it.each(
    requestHeaders.flatMap(([label, headers]) =>
      ['/vi', '/vi/dashboard'].map((path) => [path, label, headers] as const)
    )
  )(
    'keeps the canonical shared scope and Secure on %s for %s',
    async (path, _label, headers) => {
      const response = await proxy(request(path, headers));
      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        `${CHAT}${path.slice('/vi'.length) || '/'}`
      );
      expect(expectLocaleCookieOnly(response)).toMatchObject({
        domain: '.tuturuuu.com',
        maxAge: 31536000,
        name: 'NEXT_LOCALE',
        path: '/',
        sameSite: 'lax',
        secure: true,
        value: 'vi',
      });
    }
  );

  it('does not refresh a session for anonymous public requests', async () => {
    await proxy(request('/login', { host: 'evil.example' }));
    await proxy(request('/vi', { host: 'evil.example' }));
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
