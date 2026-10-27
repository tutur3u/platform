import { afterEach, describe, expect, it, vi } from 'vitest';
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
    ['rewise', 'https://rewise.me'],
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

  it.each(['rewise.me', 'nova.ai.vn'])(
    'requires the exact HTTPS origin for %s',
    (host) => {
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
    }
  );

  it('keeps unregistered Vercel deployments blocked', () => {
    expect(
      getAppDomainByUrl('https://cms-tuturuuu.vercel.app/verify-token')
    ).toBeNull();
  });
});

describe('configured staging internal app registry', () => {
  const ENV_KEY = 'NEXT_PUBLIC_TUTURUUU_INTERNAL_APP_DOMAINS';

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('registers env entries as internal apps with the token handoff', () => {
    vi.stubEnv(
      ENV_KEY,
      'tasks:https://tasks.staging.tutur3u.com, platform:https://web.staging.tutur3u.com/'
    );

    expect(getConfiguredInternalAppDomains()).toEqual([
      {
        kind: 'internal',
        name: 'tasks',
        requiresExactOrigin: true,
        url: 'https://tasks.staging.tutur3u.com',
      },
      {
        kind: 'internal',
        name: 'platform',
        requiresExactOrigin: true,
        url: 'https://web.staging.tutur3u.com',
      },
    ]);
    expect(
      getInternalAppDomainByUrl(
        'https://tasks.staging.tutur3u.com/verify-token?nextUrl=%2F'
      )
    ).toMatchObject({ kind: 'internal', name: 'tasks' });
  });

  it('accepts newline separated entries', () => {
    vi.stubEnv(
      ENV_KEY,
      'tasks:https://tasks.staging.tutur3u.com\nmeet:https://meet.staging.tutur3u.com'
    );

    expect(
      getConfiguredInternalAppDomains().map((entry) => entry.name)
    ).toEqual(['tasks', 'meet']);
  });

  it('matches only the exact registered origin', () => {
    vi.stubEnv(ENV_KEY, 'tasks:https://tasks.staging.tutur3u.com');

    for (const url of [
      'http://tasks.staging.tutur3u.com',
      'https://tasks.staging.tutur3u.com:444',
      'https://evil.tasks.staging.tutur3u.com',
      'https://tasks.staging.tutur3u.com.evil.com',
      'https://other.staging.tutur3u.com',
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
        ':https://missing-name.staging.tutur3u.com',
        'Bad Name:https://bad-name.staging.tutur3u.com',
        'http-only:http://insecure-app.staging.tutur3u.com',
        'ws:wss://socket.staging.tutur3u.com',
        'wild:https://*.staging.tutur3u.com',
        'wild2:https://*',
        'pathy:https://pathy-app.staging.tutur3u.com/some/path',
        'query:https://query-app.staging.tutur3u.com/?a=1',
        'creds:https://user:pass@creds-app.staging.tutur3u.com',
        'garbage:not a url',
        'ok:https://ok-app.staging.tutur3u.com',
      ].join(',')
    );

    expect(getConfiguredInternalAppDomains()).toEqual([
      {
        kind: 'internal',
        name: 'ok',
        requiresExactOrigin: true,
        url: 'https://ok-app.staging.tutur3u.com',
      },
    ]);
    expect(warn).toHaveBeenCalled();
    expect(
      getInternalAppDomainByUrl('http://insecure-app.staging.tutur3u.com')
    ).toBeNull();
    expect(
      getAppDomainByUrl('https://pathy-app.staging.tutur3u.com')
    ).toBeNull();
  });

  it('returns nothing when unset or blank', () => {
    vi.stubEnv(ENV_KEY, '');
    expect(getConfiguredInternalAppDomains()).toEqual([]);
    vi.stubEnv(ENV_KEY, '  ');
    expect(getConfiguredInternalAppDomains()).toEqual([]);
  });

  it('leaves the production registry and resolution unchanged without the env var', () => {
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

  it('does not change how production origins resolve when staging entries are set', () => {
    const before = getAppDomainByUrl('https://tasks.tuturuuu.com/x');

    vi.stubEnv(ENV_KEY, 'tasks:https://tasks.staging.tutur3u.com');

    expect(getAppDomainByUrl('https://tasks.tuturuuu.com/x')).toEqual(before);
  });
});
