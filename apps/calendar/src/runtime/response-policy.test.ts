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
