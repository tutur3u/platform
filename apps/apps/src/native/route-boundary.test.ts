// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { GATEWAY_APPS } from '../lib/apps-registry';
import { canonicalLocaleRedirect, localeCookie, requestLocale } from './locale';
import { gatewayDestination } from './redirect';

afterEach(() => vi.unstubAllEnvs());
describe('Apps native route parity', () => {
  it('keeps every canonical catalogue destination and duplicate query value', () => {
    vi.stubEnv('NODE_ENV', 'production');
    for (const app of GATEWAY_APPS) {
      const result = gatewayDestination(
        new URL(`https://apps.fixture.test/${app.slug}/a%2Fb?tag=1&tag=2`)
      );
      expect(result.kind).toBe('redirect');
      if (result.kind !== 'redirect')
        throw new Error('Expected a registered destination');
      const target = new URL(result.href);
      expect(target.origin).toBe(new URL(app.productionUrl).origin);
      expect(target.pathname).toBe('/a%2Fb');
      expect(target.searchParams.getAll('tag')).toEqual(['1', '2']);
      expect(target.searchParams.get('source')).toBe('apps');
    }
  });
  it('selects exact hosted staging origins only in explicit staging mode', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_STAGING', '1');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', '');
    vi.stubEnv(
      'NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN',
      '.staging.tutur3u.com'
    );
    vi.stubEnv(
      'NEXT_PUBLIC_TUTURUUU_INTERNAL_APP_DOMAINS',
      'platform:https://staging.tutur3u.com,' +
        ['meet', 'calendar', 'mail', 'apps']
          .map((name) => `${name}:https://${name}.staging.tutur3u.com`)
          .join(',')
    );
    for (const app of ['meet', 'calendar', 'mail', 'apps', 'platform']) {
      const result = gatewayDestination(
        new URL(`https://apps.staging.tutur3u.com/${app}/a%2Fb?tag=1&tag=2`)
      );
      const origin =
        app === 'platform'
          ? 'https://staging.tutur3u.com'
          : `https://${app}.staging.tutur3u.com`;
      expect(result).toEqual({
        kind: 'redirect',
        href: `${origin}/a%2Fb?tag=1&tag=2&source=apps`,
      });
    }
  });
  it('never selects an origin from untrusted query or slug', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(
      gatewayDestination(
        new URL('https://apps.fixture.test/unknown?url=https://evil.test')
      )
    ).toEqual({
      kind: 'missing',
    });
    expect(
      gatewayDestination(new URL('https://apps.fixture.test/%ZZ'))
    ).toEqual({ kind: 'invalid' });
    expect(
      gatewayDestination(
        new URL('https://apps.fixture.test/https%3A%2F%2Fevil.test')
      )
    ).toEqual({
      kind: 'missing',
    });
    const result = gatewayDestination(
      new URL(
        'https://apps.fixture.test/meet?source=sidebar&url=https://evil.test'
      )
    );
    expect(
      result.kind === 'redirect' &&
        new URL(result.href).searchParams.get('source')
    ).toBe('sidebar');
    expect(result.kind === 'redirect' && new URL(result.href).origin).toBe(
      'https://meet.tuturuuu.com'
    );
  });
  it('keeps interleaved entries, string-shaped JSON and prototype-shaped query names', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const before = Object.getPrototypeOf({});
    const result = gatewayDestination(
      new URL(
        'https://apps.fixture.test/meet/a%2Fb?tag=1&__proto__=keep&tag=2&constructor=ctor&prototype=proto&next=%2Fpersonal%3Fx%3D1&json=%5B1%2C2%5D&source=one&source=two&utm_source=fixture&space=a%20b&plus=%2B'
      )
    );
    expect(result).toEqual({
      kind: 'redirect',
      href: 'https://meet.tuturuuu.com/a%2Fb?tag=1&__proto__=keep&tag=2&constructor=ctor&prototype=proto&next=%2Fpersonal%3Fx%3D1&json=%5B1%2C2%5D&source=one&source=two&utm_source=fixture&space=a+b&plus=%2B',
    });
    expect(Object.getPrototypeOf({})).toBe(before);
    expect(Object.hasOwn(Object.prototype, 'keep')).toBe(false);
  });
  it.each(['en', 'vi'])(
    'canonicalizes %s while preserving raw query and encoded path',
    (locale) => {
      const request = new Request(
        `https://apps.tuturuuu.com/${locale}/meet/a%2Fb?tag=1&__proto__=keep&tag=2&json=%5B1%2C2%5D&space=a%20b&plus=%2B`
      );
      const result = canonicalLocaleRedirect(request);
      expect(result?.status).toBe(307);
      expect(result?.headers.get('Location')).toBe(
        'https://apps.tuturuuu.com/meet/a%2Fb?tag=1&__proto__=keep&tag=2&json=%5B1%2C2%5D&space=a%20b&plus=%2B'
      );
      expect(result?.headers.get('Set-Cookie')).toContain(
        `NEXT_LOCALE=${locale};`
      );
      expect(result?.headers.get('Set-Cookie')).toContain(
        'Domain=.tuturuuu.com'
      );
      expect(result?.headers.get('Set-Cookie')).toContain('Secure');
    }
  );
  it('uses saved locale then negotiated language, respecting q=0 and hostname boundaries', () => {
    expect(
      requestLocale(
        new Request('https://apps.tuturuuu.com', {
          headers: { cookie: 'NEXT_LOCALE=en', 'Accept-Language': 'vi' },
        })
      )
    ).toBe('en');
    expect(
      requestLocale(
        new Request('https://apps.tuturuuu.com', {
          headers: { 'Accept-Language': 'vi;q=0,en;q=0.8' },
        })
      )
    ).toBe('en');
    expect(
      requestLocale(
        new Request('https://apps.tuturuuu.com', {
          headers: { 'Accept-Language': 'vi-VN,en;q=0.8' },
        })
      )
    ).toBe('vi');
    expect(
      canonicalLocaleRedirect(
        new Request('https://evil-tuturuuu.com/vi')
      )?.headers.get('Set-Cookie')
    ).not.toContain('Domain=');
  });
});

describe('locale cookie policy', () => {
  it.each([
    {
      origin: 'http://apps.tuturuuu.com',
      domain: '.tuturuuu.com',
      secure: true,
    },
    {
      origin: 'https://apps.tuturuuu.com',
      domain: '.tuturuuu.com',
      secure: true,
    },
    {
      origin: 'http://apps.tuturuuu.localhost',
      domain: '.tuturuuu.localhost',
      secure: false,
    },
    {
      origin: 'https://apps.tuturuuu.localhost',
      domain: '.tuturuuu.localhost',
      secure: true,
    },
    { origin: 'http://localhost:3000', domain: null, secure: false },
    { origin: 'https://preview.fixture.test', domain: null, secure: true },
    { origin: 'https://tuturuuu.com.evil.test', domain: null, secure: true },
  ])(
    'serializes canonical policy for $origin',
    ({ origin, domain, secure }) => {
      vi.stubEnv('PORTLESS_URL', '');
      const cookie = localeCookie(new Request(origin), 'vi');
      expect(cookie).toBe(
        `NEXT_LOCALE=vi; Path=/; Max-Age=31536000; SameSite=Lax${domain ? `; Domain=${domain}` : ''}${secure ? '; Secure' : ''}`
      );
    }
  );

  it('uses the canonical forwarded and Portless domain resolution', () => {
    expect(
      localeCookie(
        new Request('http://127.0.0.1:3000', {
          headers: { 'x-forwarded-host': 'apps.tuturuuu.com' },
        }),
        'en'
      )
    ).toContain('; Domain=.tuturuuu.com; Secure');
    vi.stubEnv('PORTLESS_URL', 'http://apps.tuturuuu.localhost');
    vi.stubEnv('PORT', '3000');
    expect(localeCookie(new Request('http://127.0.0.1:3000'), 'en')).toBe(
      'NEXT_LOCALE=en; Path=/; Max-Age=31536000; SameSite=Lax; Domain=.tuturuuu.localhost'
    );
  });

  it.each(['en', 'vi'])(
    'preserves the %s redirect query and session cookies',
    (locale) => {
      const request = new Request(
        `https://apps.tuturuuu.com/${locale}/meet/a%2Fb?tag=1&space=a%20b&tag=2&plus=%2B`,
        { headers: { cookie: 'session=opaque; NEXT_LOCALE=en' } }
      );
      const response = canonicalLocaleRedirect(request);
      expect(response?.status).toBe(307);
      expect(response?.headers.get('Location')).toBe(
        'https://apps.tuturuuu.com/meet/a%2Fb?tag=1&space=a%20b&tag=2&plus=%2B'
      );
      expect(response?.headers.get('Cache-Control')).toBe('private, no-store');
      expect(response?.headers.get('Set-Cookie')).toBe(
        `NEXT_LOCALE=${locale}; Path=/; Max-Age=31536000; SameSite=Lax; Domain=.tuturuuu.com; Secure`
      );
      expect(request.headers.get('cookie')).toBe(
        'session=opaque; NEXT_LOCALE=en'
      );
    }
  );
});
