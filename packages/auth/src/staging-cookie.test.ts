import { afterEach, expect, it, vi } from 'vitest';
import { getAppSessionCookieOptions } from './app-session';

afterEach(() => vi.unstubAllEnvs());

it.each([
  'staging.tutur3u.com',
  'meet.staging.tutur3u.com',
  'calendar.staging.tutur3u.com',
  'mail.staging.tutur3u.com',
  'apps.staging.tutur3u.com',
  'web.staging.tutur3u.com',
])('scopes app-session cookies to the exact staging parent on %s', (host) => {
  vi.stubEnv('VERCEL_ENV', 'preview');
  vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', '');
  vi.stubEnv(
    'NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN',
    '.staging.tutur3u.com'
  );
  vi.stubEnv('NEXT_PUBLIC_APP_URL', `https://${host}`);
  vi.stubEnv('NODE_ENV', 'production');
  expect(getAppSessionCookieOptions()).toMatchObject({
    domain: '.staging.tutur3u.com',
    secure: true,
    httpOnly: true,
    sameSite: 'lax',
  });
});

it.each([
  'https://tutur3u.com',
  'https://evil.staging.tutur3u.com',
  'https://meet.tuturuuu.com',
  'http://meet.staging.tutur3u.com',
])('does not broaden app-session cookies for %s', (url) => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', url);
  expect(getAppSessionCookieOptions().domain).toBeUndefined();
});

it.each(['VERCEL_ENV', 'NEXT_PUBLIC_VERCEL_ENV'])(
  'rejects staging cookies on production through %s',
  (key) => {
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', '');
    vi.stubEnv(key, 'production');
    vi.stubEnv(
      'NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN',
      '.staging.tutur3u.com'
    );
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://web.staging.tutur3u.com');
    expect(getAppSessionCookieOptions().domain).toBeUndefined();
  }
);

it('requires explicit staging cookie opt-in', () => {
  vi.stubEnv('NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN', '');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://meet.staging.tutur3u.com');
  expect(getAppSessionCookieOptions().domain).toBeUndefined();
});
