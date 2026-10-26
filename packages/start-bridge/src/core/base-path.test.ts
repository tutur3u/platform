import { describe, expect, it } from 'vitest';
import { createBasePath, normalizeBasePath } from './base-path';

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

  it('exposes root values and never rewrites', () => {
    expect(root.isRoot).toBe(true);
    expect(root.assetBase).toBe('/');
    expect(root.serverFnBase).toBe('/_serverFn');
    expect(root.routerBasepath).toBe('/');
    expect(root.owns('/anything')).toBe(true);
    expect(root.strip('/meet/x')).toBe('/meet/x');
    expect(root.withBase('/login?next=/x')).toBe('/login?next=/x');
    expect(root.absoluteUrl('/r/abc', 'https://meet.tuturuuu.com')).toBe(
      'https://meet.tuturuuu.com/r/abc'
    );
    const request = new Request('https://meet.tuturuuu.com/x');
    expect(root.stripRequest(request)).toBe(request);
    const response = new Response(null, {
      status: 307,
      headers: {
        location: '/login',
        'set-cookie': 'tuturuuu_app_session=b; Path=/; HttpOnly',
      },
    });
    expect(root.finalizeResponse(response)).toBe(response);
  });
});

describe('under /meet', () => {
  const meet = createBasePath({ app: 'meet', basePath: '/meet' });

  it('exposes base-aware values', () => {
    expect(meet.assetBase).toBe('/meet/');
    expect(meet.serverFnBase).toBe('/meet/_serverFn');
    expect(meet.routerBasepath).toBe('/meet');
  });

  it('owns only its own segment boundary', () => {
    expect(meet.owns('/meet')).toBe(true);
    expect(meet.owns('/meet/r/abc')).toBe(true);
    expect(meet.owns('/meetings')).toBe(false);
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
    expect(meet.withBase('/\\evil.example')).toBe('/\\evil.example');
    expect(meet.withBase('relative')).toBe('relative');
    expect(meet.absoluteUrl('/r/abc', 'https://tuturuuu.com')).toBe(
      'https://tuturuuu.com/meet/r/abc'
    );
  });

  it('strips the base from requests and preserves bodies', async () => {
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

  it('rewrites relative locations only and never touches cookies', () => {
    const response = meet.finalizeResponse(
      new Response(null, {
        status: 307,
        headers: [
          ['location', '/r/abc'],
          ['set-cookie', 'tuturuuu_app_session=new; Path=/; HttpOnly; Secure'],
        ],
      })
    );
    expect(response.headers.get('location')).toBe('/meet/r/abc');
    expect(response.headers.getSetCookie()).toEqual([
      'tuturuuu_app_session=new; Path=/; HttpOnly; Secure',
    ]);
    const external = new Response(null, {
      status: 302,
      headers: { location: 'https://tuturuuu.com/login?returnUrl=x' },
    });
    expect(meet.finalizeResponse(external)).toBe(external);
  });
});

describe('trailing slash trimming', () => {
  it('trims any number of trailing slashes in linear time', async () => {
    const { trimTrailingSlashes } = await import('./base-path');
    expect(trimTrailingSlashes('/meet///')).toBe('/meet');
    expect(trimTrailingSlashes('////')).toBe('');
    const hostile = `/a${'/'.repeat(200_000)}x`;
    const started = performance.now();
    expect(trimTrailingSlashes(hostile)).toBe(hostile);
    expect(() => normalizeBasePath(hostile)).toThrow('Invalid basePath');
    expect(trimTrailingSlashes(`/meet${'/'.repeat(200_000)}`)).toBe('/meet');
    // Linear work is ~1 ms; a quadratic trim takes seconds. The generous bound
    // keeps that distinction without failing on a loaded runner's scheduler.
    expect(performance.now() - started).toBeLessThan(2000);
    expect(normalizeBasePath('/meet/////')).toBe('/meet');
  });
});
