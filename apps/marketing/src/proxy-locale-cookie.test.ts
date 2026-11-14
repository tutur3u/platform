import { NextRequest, NextResponse } from 'next/server';
import { afterAll, describe, expect, it, vi } from 'vitest';

// The marketing origin loads from the environment when the proxy module is
// imported, so it is fixed before any import runs.
vi.hoisted(() => {
  vi.stubEnv('NEXT_PUBLIC_MARKETING_APP_URL', 'https://tuturuuu.com');
  vi.stubEnv('NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN', '');
});

vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: vi.fn(),
}));

// Mirrors the stock next-intl middleware: with no valid locale cookie it
// writes a host-only `NEXT_LOCALE` cookie with no `Secure` attribute.
vi.mock('next-intl/middleware', () => ({
  default: () => (request: NextRequest) => {
    const response = NextResponse.next();
    const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value;
    if (cookieLocale !== 'en' && cookieLocale !== 'vi') {
      response.cookies.set('NEXT_LOCALE', 'en', {
        path: '/',
        sameSite: 'lax',
      });
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

const MARKETING = 'https://tuturuuu.com';

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('Marketing NEXT_LOCALE cookie scope', () => {
  it.each([
    ['without Accept-Language', {}],
    ['with an invalid locale cookie', { cookie: 'NEXT_LOCALE=xx' }],
    ['under a hostile Host header', { host: 'evil.example' }],
    [
      'under a hostile Host and X-Forwarded-Host pair',
      {
        host: 'evil.example',
        'x-forwarded-host': 'evil.example',
        'x-forwarded-proto': 'http',
      },
    ],
  ])('is host-only and Secure %s', async (_label, headers) => {
    const response = await proxy(
      new NextRequest(`${MARKETING}/pricing`, { headers })
    );
    const setCookies = response.headers.getSetCookie();
    expect(setCookies).toHaveLength(1);
    expect(setCookies[0]).toMatch(/^NEXT_LOCALE=en;/u);
    expect(setCookies[0]).toMatch(/;\s*Secure(;|$)/iu);
    expect(setCookies[0]).not.toMatch(/Domain=/iu);
  });

  it('leaves the response untouched when next-intl writes no cookie', async () => {
    const response = await proxy(
      new NextRequest(`${MARKETING}/`, {
        headers: { cookie: 'NEXT_LOCALE=vi' },
      })
    );
    expect(response.headers.getSetCookie()).toHaveLength(0);
  });
});
