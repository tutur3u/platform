import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { stagingCookieDomain } from '../staging-cookie-domain';

beforeEach(() => {
  vi.stubEnv('VERCEL_ENV', 'preview');
  vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', '');
  vi.stubEnv(
    'NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN',
    '.staging.tutur3u.com'
  );
});
afterEach(() => vi.unstubAllEnvs());
it.each([
  'staging',
  'meet.staging',
  'calendar.staging',
  'mail.staging',
  'apps.staging',
  'web.staging',
])('admits explicitly opted-in %s', (host) => {
  expect(stagingCookieDomain(`https://${host}.tutur3u.com`)).toMatchObject({
    cookieDomain: '.staging.tutur3u.com',
    secure: true,
  });
});
it.each([
  'https://tutur3u.com',
  'https://evil.staging.tutur3u.com',
  'https://meet.staging.tutur3u.com.evil.invalid',
  'https://meet.tuturuuu.com',
  'https://staging.tuturuuu.com',
  'http://meet.staging.tutur3u.com',
  'https://meet.staging.tutur3u.com:8443',
])('rejects %s', (url) => {
  expect(stagingCookieDomain(url)).toBeNull();
});
it.each(['VERCEL_ENV', 'NEXT_PUBLIC_VERCEL_ENV'])(
  'fails closed in production through %s',
  (key) => {
    vi.stubEnv(key, 'production');
    expect(stagingCookieDomain('https://meet.staging.tutur3u.com')).toBeNull();
  }
);
it('requires explicit opt-in', () => {
  vi.stubEnv('NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN', '');
  expect(stagingCookieDomain('https://meet.staging.tutur3u.com')).toBeNull();
});
