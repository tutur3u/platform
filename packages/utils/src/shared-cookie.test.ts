import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type CookieOptionsLike,
  getHostOnlyCookieOptions,
  getSharedAndHostOnlyCookieDeleteOptions,
  getTuturuuuPrimarySharedCookieDomain,
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

describe('configurable shared cookie domain', () => {
  const ENV_KEY = 'NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN';

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('defaults to .tuturuuu.com and does not resolve staging hosts', () => {
    vi.stubEnv(ENV_KEY, '');

    expect(getTuturuuuPrimarySharedCookieDomain()).toMatchObject({
      cookieDomain: '.tuturuuu.com',
      hostname: 'tuturuuu.com',
      secure: true,
    });
    expect(
      resolveTuturuuuSharedCookieDomain('https://web.staging.tutur3u.com')
    ).toBeNull();
  });

  it('resolves the configured staging domain to exactly .staging.tutur3u.com', () => {
    vi.stubEnv(ENV_KEY, '.staging.tutur3u.com');

    for (const url of [
      'https://web.staging.tutur3u.com',
      'https://tasks.staging.tutur3u.com/personal',
      'https://staging.tutur3u.com',
    ]) {
      expect(resolveTuturuuuSharedCookieDomain(url)).toEqual({
        cookieDomain: '.staging.tutur3u.com',
        hostname: 'staging.tutur3u.com',
        secure: true,
      });
    }
    expect(
      getTuturuuuSharedCookieOptions<CookieOptionsLike>(
        {},
        'https://web.staging.tutur3u.com'
      ).domain
    ).toBe('.staging.tutur3u.com');
  });

  it('never shares cookies with .tutur3u.com, tuturuuu.com or lookalikes when staging is configured', () => {
    vi.stubEnv(ENV_KEY, '.staging.tutur3u.com');

    for (const url of [
      'https://tutur3u.com',
      'https://app.tutur3u.com',
      'https://evil-staging.tutur3u.com',
      'https://web.staging.tutur3u.com.evil.test',
      'https://tuturuuu.com',
      'https://tasks.tuturuuu.com',
    ]) {
      expect(resolveTuturuuuSharedCookieDomain(url)).toBeNull();
    }
    expect(
      getTuturuuuSharedCookieOptions<CookieOptionsLike>(
        {},
        'https://app.tutur3u.com'
      ).domain
    ).toBeUndefined();
  });

  it('keeps the local portless domain when staging is configured', () => {
    vi.stubEnv(ENV_KEY, '.staging.tutur3u.com');

    expect(
      resolveTuturuuuSharedCookieDomain('https://tasks.tuturuuu.localhost')
    ).toMatchObject({ cookieDomain: '.tuturuuu.localhost', secure: false });
  });

  it.each([
    '.tutur3u.com',
    'tutur3u.com',
    '.tuturuuu.com',
    '.com',
    '.vercel.app',
    '.evil.test',
    '*.staging.tutur3u.com',
    'staging.tutur3u.com',
    '.staging.tutur3u.com.evil.test',
    'https://staging.tutur3u.com',
  ])('rejects %s, warns, and keeps the production default', (value) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv(ENV_KEY, value);

    expect(getTuturuuuPrimarySharedCookieDomain().cookieDomain).toBe(
      '.tuturuuu.com'
    );
    expect(
      resolveTuturuuuSharedCookieDomain('https://app.tutur3u.com')
    ).toBeNull();
    expect(
      resolveTuturuuuSharedCookieDomain('https://web.staging.tutur3u.com')
    ).toBeNull();
    expect(warn).toHaveBeenCalled();
  });
});
