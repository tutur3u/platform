import { afterEach, expect, it, vi } from 'vitest';
import { getAppSessionCookieOptions } from './app-session';

afterEach(() => vi.unstubAllEnvs());

const stubHostedStaging = (host: string) => {
  vi.stubEnv('VERCEL_ENV', '');
  vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', '');
  vi.stubEnv('PLATFORM_BUILD_ENVIRONMENT', '');
  vi.stubEnv('NEXT_PUBLIC_TUTURUUU_STAGING', '1');
  vi.stubEnv(
    'NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN',
    '.staging.tutur3u.com'
  );
  vi.stubEnv('NEXT_PUBLIC_APP_URL', `https://${host}`);
  vi.stubEnv('NODE_ENV', 'production');
};

it.each([
  'web.tutur3u.com',
  'meet.tutur3u.com',
  'calendar.tutur3u.com',
  'mail.tutur3u.com',
  'apps.tutur3u.com',
])('keeps hosted staging app-session cookies host-only on %s', (host) => {
  stubHostedStaging(host);
  const options = getAppSessionCookieOptions();
  expect(options.domain).toBeUndefined();
  expect(options).toMatchObject({
    secure: true,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
});

it.each([
  'https://tutur3u.com',
  'https://evil.staging.tutur3u.com',
  'https://meet.tuturuuu.com',
  'http://meet.tutur3u.com',
])('never broadens app-session cookies for %s', (url) => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', url);
  expect(getAppSessionCookieOptions().domain).toBeUndefined();
});
