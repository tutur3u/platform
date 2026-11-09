import { describe, expect, it } from 'vitest';
import {
  bypassReason,
  cacheKey,
  freshness,
  hasAuthCookie,
  isStorable,
  localeBucket,
  normalizeUrl,
} from './cache-rules';
import { manifest, matchRoute } from './manifest';

function req(path: string, init: RequestInit = {}) {
  return new Request(`https://tuturuuu.com${path}`, init);
}
const reason = (path: string, init?: RequestInit) =>
  bypassReason(req(path, init), matchRoute(new URL(req(path).url).pathname));

describe('bypassReason', () => {
  it('serves anonymous GET and HEAD for public pages from cache', () => {
    expect(reason('/about')).toBeNull();
    expect(reason('/about', { method: 'HEAD' })).toBeNull();
  });

  it('bypasses non-GET methods and non-public routes', () => {
    expect(reason('/about', { method: 'POST' })).toBe('method');
    expect(reason('/login')).toBe('route');
  });

  it('bypasses on Authorization and on any session cookie', () => {
    expect(reason('/about', { headers: { authorization: 'Bearer x' } })).toBe(
      'authorization'
    );
    for (const cookie of [
      'sb-abcdef-auth-token=1',
      'sb-abcdef-auth-token.0=1; theme=dark',
      'tuturuuu-session=1',
      '__Secure-foo=1',
    ]) {
      expect(reason('/about', { headers: { cookie } }), cookie).toBe(
        'auth-cookie'
      );
    }
  });

  it('keeps caching with harmless cookies', () => {
    expect(
      reason('/about', { headers: { cookie: 'NEXT_LOCALE=vi; _ga=GA1.2' } })
    ).toBeNull();
  });

  it('bypasses RSC, range and prefetch requests', () => {
    expect(reason('/about', { headers: { rsc: '1' } })).toBe('rsc');
    expect(reason('/about?_rsc=abc')).toBe('rsc');
    expect(reason('/about', { headers: { range: 'bytes=0-9' } })).toBe('range');
  });

  it('lets static assets ignore session cookies but not Authorization', () => {
    const path = '/_next/static/a.js';
    expect(
      reason(path, { headers: { cookie: 'sb-x-auth-token=1' } })
    ).toBeNull();
    expect(reason(path, { headers: { authorization: 'Bearer x' } })).toBe(
      'authorization'
    );
  });
});

describe('hasAuthCookie', () => {
  it('reads names only', () => {
    expect(hasAuthCookie(null)).toBe(false);
    expect(hasAuthCookie('NEXT_LOCALE=en')).toBe(false);
    expect(hasAuthCookie('a=1; sb-x-auth-token.1=2')).toBe(true);
  });
});

describe('cache keys', () => {
  it('shares one entry between GET and HEAD and ignores tracking params', () => {
    const a = cacheKey(req('/about?b=2&a=1&utm_source=x'), 'en');
    const b = cacheKey(req('/about?a=1&b=2', { method: 'HEAD' }), 'en');
    expect(a).toBe(b);
  });

  it('separates locales and real query params', () => {
    expect(cacheKey(req('/about'), 'en')).not.toBe(
      cacheKey(req('/about'), 'vi')
    );
    expect(cacheKey(req('/about?a=1'), 'en')).not.toBe(
      cacheKey(req('/about?a=2'), 'en')
    );
  });

  it('normalizes the query order', () => {
    expect(normalizeUrl(new URL('https://T.com/x?b=1&a=2'))).toBe(
      'https://t.com/x?a=2&b=1'
    );
  });
});

describe('localeBucket', () => {
  const bucket = (path: string, init?: RequestInit) =>
    localeBucket(req(path, init), matchRoute(path), manifest);

  it('prefers path, then cookie, then Accept-Language, then default', () => {
    expect(bucket('/vi/about')).toBe('vi');
    expect(bucket('/about', { headers: { cookie: 'NEXT_LOCALE=vi' } })).toBe(
      'vi'
    );
    expect(
      bucket('/about', { headers: { 'accept-language': 'vi-VN,en;q=0.5' } })
    ).toBe('vi');
    expect(bucket('/about', { headers: { 'accept-language': 'fr' } })).toBe(
      'en'
    );
    expect(bucket('/about')).toBe('en');
  });

  it('does not vary static assets by locale', () => {
    expect(
      bucket('/favicon.ico', { headers: { 'accept-language': 'vi' } })
    ).toBe('-');
  });
});

describe('isStorable', () => {
  const opts = { respectOriginCacheControl: false };
  it('never stores Set-Cookie, non-200 or Vary: * responses', () => {
    expect(
      isStorable(new Response('x', { headers: { 'set-cookie': 'a=1' } }), opts)
        .store
    ).toBe(false);
    expect(isStorable(new Response('x', { status: 404 }), opts).store).toBe(
      false
    );
    expect(isStorable(new Response('x', { status: 302 }), opts).store).toBe(
      false
    );
    expect(
      isStorable(new Response('x', { headers: { vary: '*' } }), opts).store
    ).toBe(false);
    expect(isStorable(new Response('x'), opts).store).toBe(true);
  });

  it('honours origin no-store only when asked', () => {
    const res = () =>
      new Response('x', { headers: { 'cache-control': 'private, no-store' } });
    expect(isStorable(res(), opts).store).toBe(true);
    expect(isStorable(res(), { respectOriginCacheControl: true }).store).toBe(
      false
    );
  });
});

describe('freshness', () => {
  it('is fresh for 5 minutes, stale for the next hour', () => {
    expect(freshness(0, 299_000)).toBe('hit');
    expect(freshness(0, 301_000)).toBe('stale');
    expect(freshness(0, 3_900_000)).toBe('stale');
    expect(freshness(0, 3_901_000)).toBe('expired');
  });
});
