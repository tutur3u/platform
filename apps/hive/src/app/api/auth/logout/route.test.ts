import { APP_SESSION_COOKIE_NAME } from '@tuturuuu/auth/app-session';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';

describe('Hive logout route', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('redirects browser form logout back to the Hive landing page', () => {
    const response = POST(
      new NextRequest('https://hive.tuturuuu.com/api/auth/logout', {
        headers: {
          accept: 'text/html',
          cookie: [
            `${APP_SESSION_COOKIE_NAME}=ttr_app_session`,
            'sb-resolved-kingfish-21146-auth-token=stale',
          ].join('; '),
        },
        method: 'POST',
      })
    );

    const setCookie = response.headers.get('set-cookie') ?? '';

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      'https://hive.tuturuuu.com/login'
    );
    expect(setCookie).toContain(`${APP_SESSION_COOKIE_NAME}=;`);
    expect(setCookie).toContain('sb-resolved-kingfish-21146-auth-token=;');
    expect(setCookie).toContain('Max-Age=0');
  });

  it('does not leak the internal listener origin into production logout redirects', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('HIVE_APP_URL', 'https://hive.tuturuuu.com');

    const { POST: postWithProductionEnv } = await import('./route');
    const response = postWithProductionEnv(
      new NextRequest('http://0.0.0.0:7814/api/auth/logout', {
        headers: {
          accept: 'text/html',
          cookie: `${APP_SESSION_COOKIE_NAME}=ttr_app_session`,
        },
        method: 'POST',
      })
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      'https://hive.tuturuuu.com/login'
    );
  });

  it('keeps JSON compatibility for programmatic POST logout requests', async () => {
    const response = POST(
      new NextRequest('https://hive.tuturuuu.com/api/auth/logout', {
        headers: {
          accept: 'application/json',
          cookie: `${APP_SESSION_COOKIE_NAME}=ttr_app_session`,
        },
        method: 'POST',
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it('rejects GET logout without clearing session cookies', async () => {
    const response = GET(
      new NextRequest('https://hive.tuturuuu.com/api/auth/logout', {
        headers: {
          accept: 'text/html',
          cookie: [
            `${APP_SESSION_COOKIE_NAME}=ttr_app_session`,
            'sb-resolved-kingfish-21146-auth-token=stale',
          ].join('; '),
        },
      })
    );

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('set-cookie')).toBeNull();
    await expect(response.json()).resolves.toEqual({
      error: 'Method not allowed',
    });
  });
});
