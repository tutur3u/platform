// @vitest-environment node
import { describe, expect, it } from 'vitest';
import appConfig from '../../start-bridge.config';
import {
  isDriveStagingEnvironment,
  scopeStagingCookies,
  stagingVars,
} from './staging-policy';

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

  it('scopes session rotations and deletions without losing cookie attributes', () => {
    const response = new Response(null);
    response.headers.append(
      'Set-Cookie',
      'tuturuuu_app_session=x; Path=/; HttpOnly; SameSite=Lax; Domain=.tuturuuu.com'
    );
    response.headers.append(
      'Set-Cookie',
      'tuturuuu_app_session_refresh=; Path=/; Max-Age=0; HttpOnly; Secure'
    );
    const scoped = scopeStagingCookies(response);
    expect(scoped.headers.getSetCookie()).toEqual([
      'tuturuuu_app_session=x; Path=/; HttpOnly; SameSite=Lax; Domain=.staging.tutur3u.com; Secure',
      'tuturuuu_app_session_refresh=; Path=/; Max-Age=0; HttpOnly; Domain=.staging.tutur3u.com; Secure',
    ]);
    expect(scoped.headers.get('Strict-Transport-Security')).toBe(
      'max-age=63072000'
    );
  });

  it('preserves __Host- cookies without a Domain attribute alongside shared sessions', () => {
    const cookie =
      '__Host-csrf=token; Path=/; Secure; HttpOnly; SameSite=Strict';
    const response = new Response(null);
    response.headers.append('Set-Cookie', cookie);
    response.headers.append(
      'Set-Cookie',
      '__Host-csrf=; Path=/; Secure; Max-Age=0'
    );
    response.headers.append('Set-Cookie', 'session=rotated; Path=/; HttpOnly');
    expect(scopeStagingCookies(response).headers.getSetCookie()).toEqual([
      cookie,
      '__Host-csrf=; Path=/; Secure; Max-Age=0',
      'session=rotated; Path=/; HttpOnly; Domain=.staging.tutur3u.com; Secure',
    ]);
  });

  it('makes personalized responses private, unframeable and unindexable', async () => {
    const response = await appConfig.wrapResponse?.(
      new Response('private', {
        headers: { 'Cache-Control': 'public, max-age=3600' },
      }),
      { request: new Request('https://drive.staging.tutur3u.com'), env: {} }
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
