// @vitest-environment node
import { describe, expect, it } from 'vitest';
import appConfig from '../../start-bridge.config';
import {
  isDriveStagingEnvironment,
  scopeStagingCookies,
  stagingVars,
} from './staging-policy';

const request = new Request('https://drive.tutur3u.com');

describe('Drive staging isolation', () => {
  it('requires the pinned staging project and exact origins', () => {
    expect(isDriveStagingEnvironment(stagingVars)).toBe(true);
    expect(isDriveStagingEnvironment({})).toBe(false);
    for (const name of Object.keys(stagingVars)) {
      expect(
        isDriveStagingEnvironment({
          ...stagingVars,
          [name]: 'https://tuturuuu.com',
        })
      ).toBe(false);
    }
  });

  it('keeps session rotations and deletions without losing cookie attributes', () => {
    const response = new Response(null);
    response.headers.append(
      'Set-Cookie',
      'tuturuuu_app_session=x; Path=/; HttpOnly; SameSite=Lax'
    );
    response.headers.append(
      'Set-Cookie',
      'tuturuuu_app_session_refresh=; Path=/; Max-Age=0; HttpOnly; Secure'
    );
    const scoped = scopeStagingCookies(request, response);
    expect(scoped.headers.getSetCookie()).toEqual([
      'tuturuuu_app_session=x; Path=/; HttpOnly; SameSite=Lax; Secure',
      'tuturuuu_app_session_refresh=; Path=/; Max-Age=0; HttpOnly; Secure',
    ]);
    expect(scoped.headers.get('Strict-Transport-Security')).toBe(
      'max-age=63072000'
    );
  });

  it('preserves __Host- cookies without a Domain attribute alongside host-only sessions', () => {
    const cookie =
      '__Host-csrf=token; Path=/; Secure; HttpOnly; SameSite=Strict';
    const response = new Response(null);
    response.headers.append('Set-Cookie', cookie);
    response.headers.append(
      'Set-Cookie',
      '__Host-csrf=; Path=/; Secure; Max-Age=0'
    );
    response.headers.append('Set-Cookie', 'session=rotated; Path=/; HttpOnly');
    expect(
      scopeStagingCookies(request, response).headers.getSetCookie()
    ).toEqual([
      cookie,
      '__Host-csrf=; Path=/; Secure; Max-Age=0',
      'session=rotated; Path=/; HttpOnly; Secure',
    ]);
  });

  it.each([
    '.staging.tutur3u.com',
    '.STAGING.TUTUR3U.COM',
    '.tutur3u.com',
    '.tuturuuu.com',
    'drive.tutur3u.com',
  ])('rejects any outgoing Domain including %s', async (domain) => {
    const response = new Response('private', {
      headers: {
        'Set-Cookie': `__Host-session=x; Domain=${domain}; Path=/; Secure`,
        Location: '/private',
      },
    });
    const rejected = scopeStagingCookies(request, response);
    expect(rejected.status).toBe(500);
    expect(rejected.headers.has('set-cookie')).toBe(false);
    expect(rejected.headers.has('location')).toBe(false);
    expect(await rejected.text()).toBe('Staging cookie domain rejected');
  });

  it('leaves production response identity and cookie bytes unchanged', () => {
    const response = new Response('production', {
      headers: {
        'Set-Cookie': 'session=x; Domain=.tuturuuu.com; Path=/; HttpOnly',
      },
    });
    expect(
      scopeStagingCookies(new Request('https://drive.tuturuuu.com'), response)
    ).toBe(response);
    expect(response.headers.getSetCookie()).toEqual([
      'session=x; Domain=.tuturuuu.com; Path=/; HttpOnly',
    ]);
  });

  it('makes personalized responses private, unframeable and unindexable', async () => {
    const response = await appConfig.wrapResponse?.(
      new Response('private', {
        headers: { 'Cache-Control': 'public, max-age=3600' },
      }),
      { request: new Request('https://drive.tutur3u.com'), env: {} }
    );
    expect(response?.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response?.headers.get('X-Frame-Options')).toBe('DENY');
    expect(response?.headers.get('X-Robots-Tag')).toBe(
      'noindex, nofollow, nosnippet'
    );
    expect(response?.headers.get('Strict-Transport-Security')).toBe(
      'max-age=63072000'
    );
  });
});
