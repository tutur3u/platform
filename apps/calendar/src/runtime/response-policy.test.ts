import { describe, expect, it } from 'vitest';
import { applyCalendarResponsePolicy } from './response-policy';

const request = (path: string) => new Request(`https://calendar.test${path}`);
describe('canonical Calendar response policy at the native boundary', () => {
  it.each([
    '/personal',
    '/vi/personal',
    '/login',
    '/serwist/sw.js',
    '/api/v1/calendar/connections',
  ])(
    'denies framing on %s while preserving owner headers and response data',
    async (path) => {
      const headers = new Headers({
        'Content-Security-Policy': "default-src 'self'",
        'x-owner': 'calendar',
      });
      headers.append('set-cookie', 'app=one; HttpOnly');
      headers.append('set-cookie', 'refresh=two; HttpOnly');
      const response = await applyCalendarResponsePolicy(
        request(path),
        new Response('body', { status: 202, headers })
      );
      expect(response.status).toBe(202);
      expect(await response.text()).toBe('body');
      expect(response.headers.get('content-security-policy')).toContain(
        "default-src 'self'"
      );
      expect(response.headers.get('content-security-policy')).toContain(
        "frame-ancestors 'none'"
      );
      expect(response.headers.get('x-frame-options')).toBe('DENY');
      expect(response.headers.get('x-owner')).toBe('calendar');
      expect(response.headers.getSetCookie()).toEqual([
        'app=one; HttpOnly',
        'refresh=two; HttpOnly',
      ]);
    }
  );
  it('keeps redirect status/location and protects the redirect response', async () => {
    const response = await applyCalendarResponsePolicy(
      request('/login'),
      new Response(null, {
        status: 307,
        headers: { location: 'https://tuturuuu.com/login' },
      })
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://tuturuuu.com/login');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
  });
  it.each([
    '/api/v1/workspaces/ws/external-projects/assets/asset/webgl',
    '/api/v1/workspaces/ws/external-projects/assets/asset/webgl/index.html',
  ])('retains the canonical embedding exception %s', async (path) => {
    const owner = new Response('embed', {
      headers: {
        'Content-Security-Policy': 'frame-ancestors https://owner.test',
        'x-owner': 'web',
      },
    });
    const response = await applyCalendarResponsePolicy(request(path), owner);
    expect(await response.text()).toBe('embed');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-frame-options')).toBeNull();
    expect(owner.headers.has('x-frame-options')).toBe(false);
    expect(owner.headers.get('content-security-policy')).toBe(
      'frame-ancestors https://owner.test'
    );
  });
  it.each([
    '/api/v1/workspaces/ws/external-projects/assets/asset/webgl-extra',
    '/api/v1/workspaces/ws/external-projects/assets/asset',
    '/vi/api/v1/workspaces/ws/external-projects/assets/asset/webgl',
  ])('does not widen the embedding exception to %s', async (path) => {
    expect(
      (
        await applyCalendarResponsePolicy(
          request(path),
          new Response('private')
        )
      ).headers.get('x-frame-options')
    ).toBe('DENY');
  });
});

describe('Calendar static offline document policy', () => {
  it.each(['/offline.html', '/calendar/offline.html'])(
    'allows the sealed same-origin script on %s while denying other sources and frames',
    async (path) => {
      const response = await applyCalendarResponsePolicy(
        request(path),
        new Response('<script src="/offline.js" defer></script>', {
          headers: { 'Content-Type': 'text/html' },
        }),
        'request-nonce'
      );
      const csp = response.headers.get('Content-Security-Policy');
      expect(csp).toContain("default-src 'none'");
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain("style-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).not.toContain('nonce-');
      expect(csp).not.toContain('strict-dynamic');
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    }
  );

  it.each([
    '/personal',
    '/offline.html/private',
    '/offline-extra.html',
    '/calendar/personal',
    '/calendar/offline.html/private',
    '/calendar/offline-extra.html',
    '/calendarx/offline.html',
  ])('keeps the nonce policy on %s', async (path) => {
    const response = await applyCalendarResponsePolicy(
      request(path),
      new Response('private', { headers: { 'Content-Type': 'text/html' } }),
      'request-nonce'
    );
    expect(response.headers.get('Content-Security-Policy')).toContain(
      "script-src 'nonce-request-nonce' 'strict-dynamic'"
    );
  });
});

describe('Calendar static caching under its base path', () => {
  const staticResponse = (init: Record<string, string> = {}) =>
    new Response('asset', {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'public, max-age=31536000, immutable',
        ...init,
      },
    });

  it.each([
    '/assets/index-abc123.js',
    '/serwist/sw.js',
    '/favicon.ico',
    '/calendar/assets/index-abc123.js',
    '/calendar/serwist/sw.js',
    '/calendar/favicon.ico',
  ])('keeps the origin cache policy for static %s', async (path) => {
    const response = await applyCalendarResponsePolicy(
      request(path),
      staticResponse()
    );
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=31536000, immutable'
    );
  });

  it.each([
    '/calendar/personal',
    '/calendarx/assets/index-abc123.js',
    '/calendar/api/v1/calendar/connections',
  ])('keeps dynamic paths private for %s', async (path) => {
    const response = await applyCalendarResponsePolicy(
      request(path),
      staticResponse()
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('keeps a static path private when the response sets a cookie', async () => {
    const response = await applyCalendarResponsePolicy(
      request('/calendar/assets/index-abc123.js'),
      staticResponse({ 'Set-Cookie': 'session=1; HttpOnly' })
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
});
