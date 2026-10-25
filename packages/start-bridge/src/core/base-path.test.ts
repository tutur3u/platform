import { describe, expect, it } from 'vitest';
import { createBasePath, normalizeBasePath } from './base-path';
import { scopedCookieName } from './cookie-scope';

const jwt = (exp: number) =>
  `h.${btoa(JSON.stringify({ exp })).replace(/=+$/u, '')}.s`;

describe('basePath normalization', () => {
  it('accepts the root and lowercase segments only', () => {
    expect(normalizeBasePath(undefined)).toBe('');
    expect(normalizeBasePath('/')).toBe('');
    expect(normalizeBasePath('/meet/')).toBe('/meet');
    expect(normalizeBasePath('/products/meet')).toBe('/products/meet');
    for (const bad of ['meet', '/Meet', '/me et', '/../x', '//meet', '/meet?x'])
      expect(() => normalizeBasePath(bad)).toThrow('Invalid basePath');
    expect(() => createBasePath({ app: 'Meet!' })).toThrow('Invalid app id');
  });
});

describe('root mode is the identity', () => {
  const root = createBasePath({ app: 'meet' });

  it('exposes root build values', () => {
    expect(root.isRoot).toBe(true);
    expect(root.assetBase).toBe('/');
    expect(root.serverFnBase).toBe('/_serverFn');
    expect(root.routerBasepath).toBe('/');
    expect(root.cookieScope).toBeNull();
  });

  it('never rewrites paths, requests, cookies or locations', async () => {
    expect(root.owns('/anything')).toBe(true);
    expect(root.strip('/meet/x')).toBe('/meet/x');
    expect(root.withBase('/login?next=/x')).toBe('/login?next=/x');
    expect(root.absoluteUrl('/r/abc', 'https://meet.tuturuuu.com')).toBe(
      'https://meet.tuturuuu.com/r/abc'
    );
    const request = new Request('https://meet.tuturuuu.com/x', {
      headers: { cookie: 'tuturuuu_app_session=a' },
    });
    expect(root.stripRequest(request)).toBe(request);
    expect(root.presentRequest(request).request).toBe(request);
    const response = new Response(null, {
      status: 307,
      headers: {
        location: '/login',
        'set-cookie': 'tuturuuu_app_session=b; Path=/; HttpOnly',
      },
    });
    expect(root.finalizeResponse(response, request)).toBe(response);
  });
});

describe('under /meet', () => {
  const meet = createBasePath({ app: 'meet', basePath: '/meet' });
  const session = scopedCookieName('tuturuuu_app_session', 'meet');

  it('exposes base-aware build values', () => {
    expect(meet.assetBase).toBe('/meet/');
    expect(meet.serverFnBase).toBe('/meet/_serverFn');
    expect(meet.routerBasepath).toBe('/meet');
  });

  it('owns only its own segment boundary', () => {
    expect(meet.owns('/meet')).toBe(true);
    expect(meet.owns('/meet/r/abc')).toBe(true);
    expect(meet.owns('/meetings')).toBe(false);
    expect(meet.owns('/')).toBe(false);
    expect(meet.strip('/meet')).toBe('/');
    expect(meet.strip('/meet/api/x')).toBe('/api/x');
    expect(meet.strip('/calendar/x')).toBeNull();
  });

  it('prefixes path-absolute hrefs once and leaves others alone', () => {
    expect(meet.withBase('/')).toBe('/meet');
    expect(meet.withBase('/?x=1')).toBe('/meet?x=1');
    expect(meet.withBase('/login?next=%2Fr')).toBe('/meet/login?next=%2Fr');
    expect(meet.withBase('/r/abc#notes')).toBe('/meet/r/abc#notes');
    expect(meet.withBase('/meet/r/abc')).toBe('/meet/r/abc');
    expect(meet.withBase('https://tuturuuu.com/login')).toBe(
      'https://tuturuuu.com/login'
    );
    expect(meet.withBase('//evil.example/x')).toBe('//evil.example/x');
    expect(meet.withBase('relative')).toBe('relative');
    expect(meet.absoluteUrl('/r/abc', 'https://tuturuuu.com')).toBe(
      'https://tuturuuu.com/meet/r/abc'
    );
  });

  it('strips the base for asset requests and preserves bodies', async () => {
    const stripped = meet.stripRequest(
      new Request('https://tuturuuu.com/meet/assets/app.js?v=1')
    );
    expect(stripped?.url).toBe('https://tuturuuu.com/assets/app.js?v=1');
    const post = meet.stripRequest(
      new Request('https://tuturuuu.com/meet/_serverFn/x', {
        method: 'POST',
        body: '{"a":1}',
      })
    );
    expect(post?.method).toBe('POST');
    expect(await post?.text()).toBe('{"a":1}');
    expect(
      meet.stripRequest(new Request('https://tuturuuu.com/calendar'))
    ).toBeNull();
  });

  it('presents only this app’s scoped session under the canonical name', () => {
    const { request, adopted } = meet.presentRequest(
      new Request('https://tuturuuu.com/meet/x', {
        headers: {
          cookie: `tuturuuu_app_session=root; ${session}=mine; tuturuuu_app_session__calendar=other; NEXT_LOCALE=vi`,
        },
      })
    );
    expect(request.headers.get('cookie')).toBe(
      'tuturuuu_app_session__calendar=other; NEXT_LOCALE=vi; tuturuuu_app_session=mine'
    );
    expect(adopted).toEqual([]);
  });

  it('adopts a legacy unscoped session once and re-issues it scoped', () => {
    const token = jwt(2_000_000_000);
    const presented = meet.presentRequest(
      new Request('https://tuturuuu.com/meet/x', {
        headers: { cookie: `tuturuuu_app_session=${token}` },
      })
    );
    expect(presented.request.headers.get('cookie')).toBe(
      `tuturuuu_app_session=${token}`
    );
    expect(presented.adopted).toEqual([
      { name: 'tuturuuu_app_session', value: token },
    ]);
    const response = meet.finalizeResponse(
      new Response('ok'),
      presented.request,
      presented.adopted
    );
    expect(response.headers.getSetCookie()).toEqual([
      `${session}=${token}; Path=/meet; Expires=${new Date(2_000_000_000_000).toUTCString()}; HttpOnly; SameSite=Lax; Secure`,
    ]);
  });

  it('does not adopt legacy cookies when fallback is disabled', () => {
    const strict = createBasePath({
      app: 'meet',
      basePath: '/meet',
      legacyCookieFallback: false,
    });
    const { request, adopted } = strict.presentRequest(
      new Request('https://tuturuuu.com/meet/x', {
        headers: { cookie: 'tuturuuu_app_session=root' },
      })
    );
    expect(request.headers.get('cookie')).toBeNull();
    expect(adopted).toEqual([]);
  });

  it('scopes session writes and clears, rewrites relative locations only', () => {
    const request = new Request('https://tuturuuu.com/meet/login');
    const response = meet.finalizeResponse(
      new Response(null, {
        status: 307,
        headers: [
          ['location', '/r/abc'],
          ['set-cookie', 'tuturuuu_app_session=new; Path=/; HttpOnly; Secure'],
          [
            'set-cookie',
            'tuturuuu_app_session_refresh=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
          ],
          ['set-cookie', 'NEXT_LOCALE=vi; Path=/'],
        ],
      }),
      request,
      [{ name: 'tuturuuu_app_session', value: 'stale' }]
    );
    expect(response.headers.get('location')).toBe('/meet/r/abc');
    expect(response.headers.getSetCookie()).toEqual([
      `${session}=new; Path=/meet; HttpOnly; Secure`,
      'tuturuuu_app_session_refresh__meet=; Path=/meet; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
      'NEXT_LOCALE=vi; Path=/',
    ]);
    const external = meet.finalizeResponse(
      new Response(null, {
        status: 302,
        headers: { location: 'https://tuturuuu.com/login?returnUrl=x' },
      }),
      request
    );
    expect(external.headers.get('location')).toBe(
      'https://tuturuuu.com/login?returnUrl=x'
    );
  });
});
