import { describe, expect, it } from 'vitest';
import {
  getHostOnlyCookieOptions,
  getSharedAndHostOnlyCookieDeleteOptions,
  getTuturuuuSharedCookieOptions,
  resolveTuturuuuSharedCookieDomain,
} from './shared-cookie';

describe('shared Tuturuuu cookie helpers', () => {
  it('resolves production root and subdomains to the parent domain', () => {
    expect(
      resolveTuturuuuSharedCookieDomain('https://tuturuuu.com')?.cookieDomain
    ).toBe('.tuturuuu.com');
    expect(
      resolveTuturuuuSharedCookieDomain('https://tasks.tuturuuu.com')
    ).toMatchObject({
      cookieDomain: '.tuturuuu.com',
      secure: true,
    });
  });

  it('resolves local first-party subdomains without Secure cookies', () => {
    expect(
      resolveTuturuuuSharedCookieDomain('https://tasks.tuturuuu.localhost')
    ).toMatchObject({
      cookieDomain: '.tuturuuu.localhost',
      secure: false,
    });
  });

  it('uses forwarded host headers for server requests', () => {
    const request = new Request('http://internal.localhost/api', {
      headers: {
        'x-forwarded-host': 'calendar.tuturuuu.com',
        'x-forwarded-proto': 'https',
      },
    });

    expect(resolveTuturuuuSharedCookieDomain(request)).toMatchObject({
      cookieDomain: '.tuturuuu.com',
      secure: true,
    });
  });

  it('does not share cookies on preview, localhost, or custom domains', () => {
    expect(
      resolveTuturuuuSharedCookieDomain('https://tuturuuu-git-main.vercel.app')
    ).toBe(null);
    expect(resolveTuturuuuSharedCookieDomain('http://localhost:7803')).toBe(
      null
    );
    expect(resolveTuturuuuSharedCookieDomain('https://nova.ai.vn')).toBe(null);
  });

  it('applies shared options only when the current host is first-party', () => {
    expect(
      getTuturuuuSharedCookieOptions(
        { maxAge: 60, path: '/', sameSite: 'lax' as const },
        'https://finance.tuturuuu.com'
      )
    ).toEqual({
      domain: '.tuturuuu.com',
      maxAge: 60,
      path: '/',
      sameSite: 'lax',
      secure: true,
    });
    expect(
      getTuturuuuSharedCookieOptions(
        { maxAge: 60, path: '/', sameSite: 'lax' as const },
        'https://rewise.me'
      )
    ).toEqual({
      maxAge: 60,
      path: '/',
      sameSite: 'lax',
    });
  });

  it('returns host-only and shared delete options when a shared domain exists', () => {
    expect(
      getSharedAndHostOnlyCookieDeleteOptions(
        { path: '/', sameSite: 'lax' as const },
        'https://drive.tuturuuu.com'
      )
    ).toEqual([
      {
        maxAge: 0,
        path: '/',
        sameSite: 'lax',
      },
      {
        domain: '.tuturuuu.com',
        maxAge: 0,
        path: '/',
        sameSite: 'lax',
        secure: true,
      },
    ]);
  });

  it('strips domains from host-only options', () => {
    expect(
      getHostOnlyCookieOptions({
        domain: '.tuturuuu.com',
        maxAge: 0,
        path: '/',
      })
    ).toEqual({
      maxAge: 0,
      path: '/',
    });
  });
});
