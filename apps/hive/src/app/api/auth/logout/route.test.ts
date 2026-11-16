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
          origin: 'https://hive.tuturuuu.com',
          cookie: [
            `${APP_SESSION_COOKIE_NAME}=ttr_app_session`,
            'sb-fixture-auth-token=stale',
          ].join('; '),
        },
        method: 'POST',
      })
    );

    const setCookie = response.headers.get('set-cookie') ?? '';

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/login');
    expect(setCookie).toContain(`${APP_SESSION_COOKIE_NAME}=;`);
    expect(setCookie).toContain('sb-fixture-auth-token=;');
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
          origin: 'https://hive.tuturuuu.com',
          cookie: `${APP_SESSION_COOKIE_NAME}=ttr_app_session`,
        },
        method: 'POST',
      })
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/login');
  });

  it('keeps JSON compatibility for programmatic POST logout requests', async () => {
    const response = POST(
      new NextRequest('https://hive.tuturuuu.com/api/auth/logout', {
        headers: {
          origin: 'https://hive.tuturuuu.com',
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

  it('redirects GET to confirmation without clearing session cookies', async () => {
    const response = GET(
      new NextRequest('https://hive.tuturuuu.com/api/auth/logout', {
        headers: {
          accept: 'text/html',
          origin: 'https://hive.tuturuuu.com',
          cookie: [
            `${APP_SESSION_COOKIE_NAME}=ttr_app_session`,
            'sb-fixture-auth-token=stale',
          ].join('; '),
        },
      })
    );

    expect(response.status).toBe(303);
    const confirmation = new URL(response.headers.get('location') ?? '');
    expect(confirmation.pathname).toBe('/logout');
    expect(confirmation.searchParams.get('appUrl')).toBe(
      'https://hive.tuturuuu.com'
    );
    expect(response.headers.get('set-cookie')).toBeNull();
  });
});
