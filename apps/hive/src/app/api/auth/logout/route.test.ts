import { APP_SESSION_COOKIE_NAME } from '@tuturuuu/auth/app-session';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { GET, POST } from './route';

describe('Hive logout route', () => {
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

  it('keeps JSON compatibility for programmatic logout requests', async () => {
    const response = GET(
      new NextRequest('https://hive.tuturuuu.com/api/auth/logout', {
        headers: {
          accept: 'application/json',
          cookie: `${APP_SESSION_COOKIE_NAME}=ttr_app_session`,
        },
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    await expect(response.json()).resolves.toEqual({ success: true });
  });
});
