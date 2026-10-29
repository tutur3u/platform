import { afterEach, expect, it, vi } from 'vitest';
import { getAppDomainByUrl, getAppDomainMap } from './internal-domains';

afterEach(() => vi.unstubAllEnvs());

it('admits only the five exact internal origins in explicit staging mode', () => {
  vi.stubEnv('VERCEL_ENV', 'preview');
  vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', '');
  vi.stubEnv(
    'NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN',
    '.staging.tutur3u.com'
  );
  vi.stubEnv(
    'NEXT_PUBLIC_TUTURUUU_INTERNAL_APP_DOMAINS',
    'platform:https://staging.tutur3u.com,platform:https://web.staging.tutur3u.com,' +
      ['meet', 'calendar', 'mail', 'apps']
        .map((app) => `${app}:https://${app}.staging.tutur3u.com`)
        .join(',')
  );
  expect(
    getAppDomainMap().filter((entry) => entry.requiresExactOrigin)
  ).toHaveLength(6);
  for (const app of ['meet', 'calendar', 'mail', 'apps']) {
    const url = `https://${app}.staging.tutur3u.com`;
    expect(getAppDomainByUrl(url)).toMatchObject({
      kind: 'internal',
      name: app,
      canonicalUrl: url,
    });
    expect(getAppDomainByUrl(`https://${app}.tuturuuu.com`)).toBeNull();
    expect(
      getAppDomainByUrl(`https://evil.${app}.staging.tutur3u.com`)
    ).toBeNull();
  }
  expect(getAppDomainByUrl('https://staging.tutur3u.com')).toMatchObject({
    kind: 'internal',
    name: 'platform',
  });
  expect(getAppDomainByUrl('https://tuturuuu.com')).toBeNull();
});

it('production does not gain staging trust', () => {
  vi.stubEnv('NEXT_PUBLIC_TUTURUUU_STAGING', '0');
  expect(getAppDomainByUrl('https://mail.tuturuuu.com')).toMatchObject({
    name: 'mail',
  });
  expect(getAppDomainByUrl('https://mail.staging.tutur3u.com')).toBeNull();
});
