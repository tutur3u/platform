import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getAppDomainByUrl, getAppDomainMap } from './internal-domains';
import {
  getConfiguredSharedCookieDomainOverride,
  resetProductionOverrideErrorLogForTests,
} from './shared-cookie';

const stagingRegistry =
  'platform:https://web.tutur3u.com,' +
  ['meet', 'calendar', 'mail', 'apps']
    .map((app) => `${app}:https://${app}.tutur3u.com`)
    .join(',');

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  resetProductionOverrideErrorLogForTests();
  vi.stubEnv('TUTURUUU_DEPLOY_ENV', undefined);
  vi.stubEnv('VERCEL_ENV', 'preview');
  vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', '');
  vi.stubEnv('PLATFORM_BUILD_ENVIRONMENT', '');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
  vi.stubEnv('NEXT_PUBLIC_TUTURUUU_STAGING', '1');
  vi.stubEnv(
    'NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN',
    '.staging.tutur3u.com'
  );
  vi.stubEnv('NEXT_PUBLIC_TUTURUUU_INTERNAL_APP_DOMAINS', stagingRegistry);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it('admits only the five exact internal origins in explicit staging mode', () => {
  expect(
    getAppDomainMap().filter((entry) => entry.requiresExactOrigin)
  ).toHaveLength(5);
  for (const app of ['meet', 'calendar', 'mail', 'apps']) {
    const url = `https://${app}.tutur3u.com`;
    expect(getAppDomainByUrl(url)).toMatchObject({
      kind: 'internal',
      name: app,
      canonicalUrl: url,
    });
    expect(getAppDomainByUrl(`https://${app}.tuturuuu.com`)).toBeNull();
    expect(getAppDomainByUrl(`https://evil.${app}.tutur3u.com`)).toBeNull();
  }
  expect(getAppDomainByUrl('https://web.tutur3u.com')).toMatchObject({
    kind: 'internal',
    name: 'platform',
  });
  expect(getAppDomainByUrl('https://tuturuuu.com')).toBeNull();
});

it.each([
  ['VERCEL_ENV', 'production'],
  ['NEXT_PUBLIC_VERCEL_ENV', 'production'],
  ['PLATFORM_BUILD_ENVIRONMENT', 'production'],
  ['NEXT_PUBLIC_APP_URL', 'https://mail.tuturuuu.com'],
])(
  'production does not gain staging trust through %s even with the staging registry and cookie domain set',
  (key, value) => {
    vi.stubEnv(key, value);
    expect(getConfiguredSharedCookieDomainOverride()).toBeNull();
    expect(getAppDomainByUrl('https://mail.tuturuuu.com')).toMatchObject({
      name: 'mail',
    });
    expect(getAppDomainByUrl('https://mail.tutur3u.com')).toBeNull();
    expect(
      getAppDomainMap().filter((entry) => entry.requiresExactOrigin)
    ).toEqual([]);
  }
);
