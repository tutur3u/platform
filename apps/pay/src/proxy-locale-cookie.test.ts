import { NextRequest, NextResponse } from 'next/server';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Pay's canonical origins load from the environment when the proxy module is
// imported, so they are fixed before any import runs.
vi.hoisted(() => {
  vi.stubEnv('PAY_APP_URL', 'https://pay.tuturuuu.com');
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
vi.mock('next-intl/middleware', () => ({
  default: () => () => NextResponse.next(),
}));

import { proxy } from './proxy';

const PAY = 'https://pay.tuturuuu.com';
const SHARED_LOCALE_COOKIE = {
  domain: '.tuturuuu.com',
  maxAge: 31536000,
  path: '/',
  sameSite: 'lax',
  secure: true,
};

function request(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`${PAY}${path}`, {
    headers: { 'accept-language': 'en', ...headers },
  });
}

function expectSharedLocaleCookieOnly(response: NextResponse, value: string) {
  expect(response.cookies.get('NEXT_LOCALE')).toMatchObject({
    ...SHARED_LOCALE_COOKIE,
    name: 'NEXT_LOCALE',
    value,
  });
  // Anonymous requests receive the locale cookie and no auth cookie.
  const setCookies = response.headers.getSetCookie();
  expect(setCookies).toHaveLength(1);
  expect(setCookies[0]).toMatch(/^NEXT_LOCALE=/u);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('Pay NEXT_LOCALE cookie scope', () => {
  const requestHeaders: [string, Record<string, string>][] = [
    ['the canonical request', {}],
    ['a hostile Host header', { host: 'evil.example' }],
    [
      'a hostile X-Forwarded-Host header',
      { 'x-forwarded-host': 'evil.example' },
    ],
    [
      'a hostile Host and X-Forwarded-Host pair',
      {
        host: 'evil.example',
        'x-forwarded-host': 'evil.example',
        'x-forwarded-proto': 'http',
      },
    ],
  ];

  it.each(requestHeaders)(
    'keeps the shared Domain and Secure on / for %s',
    async (_label, headers) => {
      const response = await proxy(request('/', headers));
      expectSharedLocaleCookieOnly(response, 'en');
    }
  );

  it.each(requestHeaders)(
    'keeps the shared Domain and Secure on /login for %s',
    async (_label, headers) => {
      const response = await proxy(request('/login', headers));
      expectSharedLocaleCookieOnly(response, 'en');
    }
  );

  it.each(requestHeaders)(
    'keeps the shared Domain and Secure on the /vi locale redirect for %s',
    async (_label, headers) => {
      const response = await proxy(request('/vi/dashboard', headers));
      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(`${PAY}/dashboard`);
      expectSharedLocaleCookieOnly(response, 'vi');
    }
  );

  it('does not refresh a session for anonymous public requests', async () => {
    await proxy(request('/', { host: 'evil.example' }));
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
