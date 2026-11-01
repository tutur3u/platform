import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APP_DOMAIN_MAP,
  getAppDomainByUrl,
  getAppDomainMap,
  getConfiguredExternalAppDomains,
  getConfiguredInternalAppDomains,
  getInternalAppDomainByUrl,
  PRODUCTION_INTERNAL_APP_DOMAINS,
} from './internal-domains';

describe('registered production satellite origins', () => {
  it.each([
    ['nova', 'https://nova.ai.vn'],
    ['rewise', 'https://rewise.tuturuuu.com'],
    ['nova', 'https://nova.tuturuuu.com'],
    ['cms', 'https://cms.tuturuuu.com'],
  ])('resolves %s at %s for central login', (name, origin) => {
    const returnUrl = `${origin}/verify-token?nextUrl=%2F`;
    expect(getAppDomainByUrl(returnUrl)).toMatchObject({
      canonicalUrl: returnUrl,
      kind: 'internal',
      name,
    });
  });

  it.each(['nova.ai.vn'])('requires the exact HTTPS origin for %s', (host) => {
    for (const origin of [
      `http://${host}`,
      `https://${host}:444`,
      `https://${host}.evil.com`,
      `https://evil${host}`,
      `https://preview.${host}`,
      `https://${host}@evil.com`,
      `https://evil.com@${host}`,
      `https://user:password@${host}`,
    ]) {
      expect(getAppDomainByUrl(`${origin}/verify-token`), origin).toBeNull();
    }
  });

  it('no longer trusts the expired rewise.me domain', () => {
    expect(getAppDomainByUrl('https://rewise.me/verify-token')).toBeNull();
    expect(getInternalAppDomainByUrl('https://rewise.me')).toBeNull();
  });

  it('keeps unregistered Vercel deployments blocked', () => {
    expect(
      getAppDomainByUrl('https://cms-tuturuuu.vercel.app/verify-token')
    ).toBeNull();
  });
});

describe('configured staging internal app registry', () => {
  const ENV_KEY = 'NEXT_PUBLIC_TUTURUUU_INTERNAL_APP_DOMAINS';
  const COOKIE_ENV_KEY = 'NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN';

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_STAGING', '1');
    vi.stubEnv(COOKIE_ENV_KEY, '.staging.tutur3u.com');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('registers env entries as internal apps with the token handoff', () => {
    vi.stubEnv(
      ENV_KEY,
      'tasks:https://tasks.tutur3u.com, platform:https://web.tutur3u.com/'
    );

    expect(getConfiguredInternalAppDomains()).toEqual([
      {
        kind: 'internal',
        name: 'tasks',
        requiresExactOrigin: true,
        url: 'https://tasks.tutur3u.com',
      },
      {
        kind: 'internal',
        name: 'platform',
        requiresExactOrigin: true,
        url: 'https://web.tutur3u.com',
      },
    ]);
    expect(
      getInternalAppDomainByUrl(
        'https://tasks.tutur3u.com/verify-token?nextUrl=%2F'
      )
    ).toMatchObject({ kind: 'internal', name: 'tasks' });
  });

  it('accepts newline separated entries', () => {
    vi.stubEnv(
      ENV_KEY,
      'tasks:https://tasks.tutur3u.com\nmeet:https://meet.tutur3u.com'
    );

    expect(
      getConfiguredInternalAppDomains().map((entry) => entry.name)
    ).toEqual(['tasks', 'meet']);
  });

  it('matches only the exact registered origin', () => {
    vi.stubEnv(ENV_KEY, 'tasks:https://tasks.tutur3u.com');

    for (const url of [
      'http://tasks.tutur3u.com',
      'https://tasks.tutur3u.com:444',
      'https://evil.tasks.tutur3u.com',
      'https://tasks.tutur3u.com.evil.com',
      'https://other.tutur3u.com',
    ]) {
      expect(getInternalAppDomainByUrl(url)).toBeNull();
    }
  });

  it('ignores malformed entries and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    vi.stubEnv(
      ENV_KEY,
      [
        'no-separator',
        ':https://missing-name.tutur3u.com',
        'Bad Name:https://bad-name.tutur3u.com',
        'cms:http://insecure-app.tutur3u.com',
        'cms:wss://socket.tutur3u.com',
        'cms:https://*.staging.tutur3u.com',
        'cms:https://*',
        'cms:https://pathy-app.tutur3u.com/some/path',
        'cms:https://query-app.tutur3u.com/?a=1',
        'cms:https://user:pass@creds-app.tutur3u.com',
        'cms:not a url',
        'cms:https://cms.tutur3u.com',
      ].join(',')
    );

    expect(getConfiguredInternalAppDomains()).toEqual([
      {
        kind: 'internal',
        name: 'cms',
        requiresExactOrigin: true,
        url: 'https://cms.tutur3u.com',
      },
    ]);
    expect(warn).toHaveBeenCalled();
    expect(
      getInternalAppDomainByUrl('http://insecure-app.tutur3u.com')
    ).toBeNull();
    expect(getAppDomainByUrl('https://pathy-app.tutur3u.com')).toBeNull();
  });

  it('returns nothing when unset or blank', () => {
    vi.stubEnv(ENV_KEY, '');
    expect(getConfiguredInternalAppDomains()).toEqual([]);
    vi.stubEnv(ENV_KEY, '  ');
    expect(getConfiguredInternalAppDomains()).toEqual([]);
  });

  it.each([
    ['production default', ''],
    ['rejected .tutur3u.com', '.tutur3u.com'],
    ['rejected .tuturuuu.com', '.tuturuuu.com'],
    ['rejected sibling zone', '.foo.tutur3u.com'],
  ])(
    'registers nothing unless the shared cookie domain is the accepted override (%s)',
    (_label, cookieDomain) => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.stubEnv('NEXT_PUBLIC_TUTURUUU_STAGING', undefined);
      vi.stubEnv(COOKIE_ENV_KEY, cookieDomain);
      vi.stubEnv(
        ENV_KEY,
        'tasks:https://tasks.tutur3u.com,platform:https://tuturuuu.com'
      );

      expect(getConfiguredInternalAppDomains()).toEqual([]);
      expect(getAppDomainMap()).toHaveLength(
        APP_DOMAIN_MAP.length + getConfiguredExternalAppDomains().length
      );
      expect(
        getInternalAppDomainByUrl('https://tasks.tutur3u.com/x')
      ).toBeNull();
    }
  );

  it('only accepts hosts equal to or under the override hostname', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    vi.stubEnv(
      ENV_KEY,
      [
        'platform:https://tuturuuu.com',
        'tasks:https://tasks.tuturuuu.com',
        'calendar:https://calendar.staging.tutur3u.com',
        'drive:https://drive.example.com',
        'chat:https://evil-staging.tutur3u.com',
        'ai:https://tasks.tutur3u.com.evil.test',
        'cms:https://cms.tutur3u.com:8443',
        'docs:https://docs.tutur3u.com:443',
        'learn:https://learn.tutur3u.com.',
        'meet:https://meet.tutur3u.com',
        'platform:https://staging.tutur3u.com',
      ].join(',')
    );

    expect(
      getConfiguredInternalAppDomains().map((entry) => [entry.name, entry.url])
    ).toEqual([['meet', 'https://meet.tutur3u.com']]);
    expect(warn).toHaveBeenCalled();
  });

  it('rejects names that are not existing app names', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    vi.stubEnv(
      ENV_KEY,
      'brand-new-app:https://new.tutur3u.com,tasks:https://tasks.tutur3u.com'
    );

    expect(
      getConfiguredInternalAppDomains().map((entry) => entry.name)
    ).toEqual(['tasks']);
    expect(warn).toHaveBeenCalled();
  });

  it('leaves the production registry and resolution unchanged without the env vars', () => {
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_STAGING', undefined);
    vi.stubEnv(COOKIE_ENV_KEY, '');
    vi.stubEnv(ENV_KEY, '');

    const productionNames = getAppDomainMap()
      .filter((domain) => domain.url.endsWith('.tuturuuu.com'))
      .map((domain) => [domain.name, domain.url, domain.kind]);

    expect(productionNames).toEqual(
      PRODUCTION_INTERNAL_APP_DOMAINS.filter((domain) =>
        domain.url.endsWith('.tuturuuu.com')
      ).map((domain) => [domain.name, domain.url, 'internal'])
    );
    expect(getAppDomainMap()).toHaveLength(
      APP_DOMAIN_MAP.length + getConfiguredExternalAppDomains().length
    );
  });

  it('stops resolving production app origins on the isolated staging deployment', () => {
    vi.stubEnv(
      ENV_KEY,
      'tasks:https://tasks.tutur3u.com,platform:https://web.tutur3u.com'
    );

    for (const url of [
      'https://tasks.tuturuuu.com/verify-token',
      'https://tuturuuu.com/verify-token',
    ]) {
      expect(getAppDomainByUrl(url), url).toBeNull();
    }
    expect(
      getAppDomainByUrl('https://tasks.tutur3u.com/verify-token')
    ).toMatchObject({ kind: 'internal', name: 'tasks' });
  });

  it('does not change how production origins resolve when staging entries are set without the override', () => {
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_STAGING', undefined);
    vi.stubEnv(COOKIE_ENV_KEY, '');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const before = getAppDomainByUrl('https://tasks.tuturuuu.com/x');

    vi.stubEnv(ENV_KEY, 'tasks:https://tasks.tutur3u.com');

    expect(getAppDomainByUrl('https://tasks.tuturuuu.com/x')).toEqual(before);
  });
});
