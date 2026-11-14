// @vitest-environment node
import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getLocaleCookieOptions,
  secureLocaleCookie,
  withSecureLocaleCookie,
} from './locale-cookie';

const OPTIONS = {
  maxAge: 31536000,
  path: '/',
  sameSite: 'lax',
} as const;

let previousSharedDomain: string | undefined;

beforeEach(() => {
  previousSharedDomain = process.env.NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN;
  delete process.env.NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN;
});

afterEach(() => {
  if (previousSharedDomain === undefined) {
    delete process.env.NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN;
  } else {
    process.env.NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN =
      previousSharedDomain;
  }
});

function setCookieHeader(response: NextResponse) {
  const [header] = response.headers.getSetCookie();
  return header ?? '';
}

describe('getLocaleCookieOptions', () => {
  it('uses the shared domain and Secure for a tuturuuu.com origin', () => {
    expect(
      getLocaleCookieOptions(OPTIONS, 'https://mind.tuturuuu.com')
    ).toEqual({ ...OPTIONS, domain: '.tuturuuu.com', secure: true });
  });

  it('is host-only and Secure for another https origin', () => {
    expect(getLocaleCookieOptions(OPTIONS, 'https://preview.example')).toEqual({
      ...OPTIONS,
      secure: true,
    });
  });

  it('stays non-secure for a local http origin', () => {
    const options = getLocaleCookieOptions(OPTIONS, 'http://localhost:7816');
    expect(options.secure).toBeFalsy();
    expect(options.domain).toBeUndefined();
  });

  it('fails closed to host-only Secure without an origin', () => {
    expect(
      getLocaleCookieOptions({ ...OPTIONS, domain: '.evil.example' }, null)
    ).toEqual({ ...OPTIONS, secure: true });
  });
});

describe('secureLocaleCookie', () => {
  it('keeps a next-intl cookie host-only and adds Secure', () => {
    const response = NextResponse.next();
    response.cookies.set('NEXT_LOCALE', 'en', { path: '/', sameSite: 'lax' });

    secureLocaleCookie(response, 'https://mind.tuturuuu.com');

    expect(response.cookies.get('NEXT_LOCALE')).toMatchObject({
      path: '/',
      sameSite: 'lax',
      secure: true,
      value: 'en',
    });
    expect(response.cookies.get('NEXT_LOCALE')?.domain).toBeUndefined();
    expect(setCookieHeader(response)).not.toMatch(/Domain=/iu);
    expect(setCookieHeader(response)).not.toMatch(/Max-Age=/iu);
  });

  it('re-scopes a domain cookie to the canonical shared domain', () => {
    const response = NextResponse.next();
    response.cookies.set('NEXT_LOCALE', 'vi', {
      ...OPTIONS,
      domain: '.evil.example',
    });

    secureLocaleCookie(response, 'https://chat.tuturuuu.com');

    expect(response.cookies.get('NEXT_LOCALE')).toMatchObject({
      ...OPTIONS,
      domain: '.tuturuuu.com',
      secure: true,
      value: 'vi',
    });
  });

  it('drops a domain the canonical origin does not share', () => {
    const response = NextResponse.next();
    response.cookies.set('NEXT_LOCALE', 'vi', {
      ...OPTIONS,
      domain: '.tuturuuu.com',
    });

    secureLocaleCookie(response, 'https://preview.example');

    expect(response.cookies.get('NEXT_LOCALE')?.domain).toBeUndefined();
    expect(response.cookies.get('NEXT_LOCALE')?.secure).toBe(true);
  });

  it('leaves responses without a locale cookie untouched', () => {
    const response = NextResponse.next();
    response.cookies.set('other', '1', { path: '/' });

    secureLocaleCookie(response, 'https://mind.tuturuuu.com');

    expect(response.headers.getSetCookie()).toEqual(['other=1; Path=/']);
  });

  it('passes through values without cookies', () => {
    expect(secureLocaleCookie(undefined, 'https://a.example')).toBeUndefined();
    const plain = new Response(null);
    expect(secureLocaleCookie(plain, 'https://a.example')).toBe(plain);
  });
});

describe('withSecureLocaleCookie', () => {
  it('scopes every locale cookie the handler emits', async () => {
    const proxy = withSecureLocaleCookie(
      async (_request: NextRequest) => {
        const response = NextResponse.next();
        response.cookies.set('NEXT_LOCALE', 'en', { path: '/' });
        return response;
      },
      () => 'https://tools.tuturuuu.com'
    );

    const response = await proxy(
      new NextRequest('https://tools.tuturuuu.com/', {
        headers: { host: 'evil.example' },
      })
    );

    expect(setCookieHeader(response)).toMatch(/;\s*Secure(;|$)/iu);
    expect(setCookieHeader(response)).not.toMatch(/evil\.example/iu);
  });
});
