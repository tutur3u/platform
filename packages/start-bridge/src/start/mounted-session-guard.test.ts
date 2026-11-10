import { describe, expect, it } from 'vitest';
import {
  refuseMountedSessionMinting,
  stripMountedSessionWrites,
} from './mounted-session-guard';

describe('refuseMountedSessionMinting', () => {
  it('refuses only the per-app session-minting endpoints', () => {
    expect(
      refuseMountedSessionMinting('/api/auth/verify-app-token')?.status
    ).toBe(409);
    expect(
      refuseMountedSessionMinting('/api/auth/refresh-app-session')?.status
    ).toBe(409);
    for (const path of [
      '/api/auth/logout',
      '/api/auth/verify-app-token-extra',
      '/verify-token',
      '/api/auth',
      '/',
    ]) {
      expect(refuseMountedSessionMinting(path)).toBeNull();
    }
  });
});

describe('stripMountedSessionWrites', () => {
  it('returns the same response when nothing is forbidden', () => {
    const response = new Response('x', {
      headers: { 'set-cookie': 'NEXT_LOCALE=en; Path=/' },
    });
    expect(stripMountedSessionWrites(response)).toBe(response);
  });

  it('matches cookie names exactly, not by prefix', () => {
    const response = new Response('x');
    response.headers.append('set-cookie', ' tuturuuu_app_session =x; Path=/');
    response.headers.append('set-cookie', 'tuturuuu_app_session_x=1; Path=/');
    response.headers.append('set-cookie', 'my_tuturuuu_app_session=1; Path=/');
    expect(stripMountedSessionWrites(response).headers.getSetCookie()).toEqual([
      'tuturuuu_app_session_x=1; Path=/',
      'my_tuturuuu_app_session=1; Path=/',
    ]);
  });

  it('also drops prefixed and chunked forms of the session cookies', () => {
    const response = new Response('x');
    for (const value of [
      '__Secure-tuturuuu_app_session=a; Path=/; Secure',
      '__Host-tuturuuu_web_app_session=b; Path=/; Secure',
      'tuturuuu_app_session.0=c; Path=/',
      'tuturuuu_app_session_refresh.12=d; Path=/',
      '__Secure-tuturuuu_web_app_session_refresh.1=e; Path=/; Secure',
      'tuturuuu_app_session.x=keep; Path=/',
      '__Other-tuturuuu_app_session=keep; Path=/',
    ]) {
      response.headers.append('set-cookie', value);
    }
    expect(stripMountedSessionWrites(response).headers.getSetCookie()).toEqual([
      'tuturuuu_app_session.x=keep; Path=/',
      '__Other-tuturuuu_app_session=keep; Path=/',
    ]);
  });

  it('keeps status, body and other headers', async () => {
    const response = new Response('body', {
      status: 302,
      headers: {
        location: '/learn/x',
        'set-cookie': 'tuturuuu_web_app_session=; Max-Age=0; Path=/',
      },
    });
    const result = stripMountedSessionWrites(response);
    expect(result.status).toBe(302);
    expect(result.headers.get('location')).toBe('/learn/x');
    expect(result.headers.getSetCookie()).toEqual([]);
    expect(await result.text()).toBe('body');
  });
});
