import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCanonicalLocaleCookieOptions,
  resolveLocaleCookieOrigin,
  withCanonicalLocaleCookie,
} from './locale-cookie';

const CHAT = 'https://chat.tuturuuu.com';
const ORIGINS = {
  canonicalOrigins: [CHAT],
  webAppUrl: 'https://tuturuuu.com',
};
const OPTIONS = { maxAge: 31536000, path: '/', sameSite: 'lax' } as const;

const hostileHeaders: [string, Record<string, string>][] = [
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
  vi.stubEnv('NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN', '');
  vi.stubEnv('TUTURUUU_GATEWAY_ORIGIN_HOSTS', '');
  vi.stubEnv('TRUSTED_PROXY', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function request(headers: Record<string, string>, url = `${CHAT}/login`) {
  return new NextRequest(url, { headers });
}

describe('canonical locale cookie scope', () => {
  it.each(hostileHeaders)(
    'resolves the canonical origin for %s',
    (_label, headers) => {
      expect(resolveLocaleCookieOrigin(request(headers), ORIGINS)).toBe(CHAT);
    }
  );

  it.each(hostileHeaders)(
    'keeps the shared domain and Secure on written cookies for %s',
    (_label, headers) => {
      expect(
        getCanonicalLocaleCookieOptions(request(headers), ORIGINS, OPTIONS)
      ).toEqual({ ...OPTIONS, domain: '.tuturuuu.com', secure: true });
    }
  );

  it.each(hostileHeaders)(
    'keeps a next-intl cookie host-only and Secure for %s',
    async (_label, headers) => {
      const proxy = withCanonicalLocaleCookie(() => {
        const response = NextResponse.next();
        response.cookies.set('NEXT_LOCALE', 'en', {
          path: '/',
          sameSite: 'lax',
        });
        return response;
      }, ORIGINS);

      const response = await proxy(request(headers));
      const [header] = response.headers.getSetCookie();

      expect(response.headers.getSetCookie()).toHaveLength(1);
      expect(header).toMatch(/^NEXT_LOCALE=en;/u);
      expect(header).toMatch(/;\s*Secure(;|$)/iu);
      expect(header).not.toMatch(/Domain=/iu);
    }
  );

  it('keeps local development cookies non-secure', async () => {
    const local = 'http://localhost:7804';
    const proxy = withCanonicalLocaleCookie(
      () => {
        const response = NextResponse.next();
        response.cookies.set('NEXT_LOCALE', 'vi', { path: '/' });
        return response;
      },
      { canonicalOrigins: [local] }
    );

    const response = await proxy(new NextRequest(`${local}/`));
    expect(response.cookies.get('NEXT_LOCALE')?.secure).toBe(false);
  });
});
