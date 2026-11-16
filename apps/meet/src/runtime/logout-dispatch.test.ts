import {
  APP_LOGOUT_COOKIE_NAME,
  APP_SESSION_COOKIE_NAME,
  APP_SESSION_REFRESH_COOKIE_NAME,
  WEB_APP_SESSION_COOKIE_NAME,
  WEB_APP_SESSION_REFRESH_COOKIE_NAME,
} from '@tuturuuu/auth/app-session';
import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { describe, expect, it } from 'vitest';
import { dispatchMeetEndpoint } from './api-registry';
import { dispatchThroughMeetProxy } from './proxy-bridge';

const appOrigin = 'https://meet.tuturuuu.com';
const sessionCookies = [
  APP_SESSION_COOKIE_NAME,
  APP_SESSION_REFRESH_COOKIE_NAME,
  WEB_APP_SESSION_COOKIE_NAME,
  WEB_APP_SESSION_REFRESH_COOKIE_NAME,
];

async function dispatchLogout(
  method: string,
  origin: string | null = appOrigin
) {
  const headers = new Headers({ accept: 'application/json' });
  if (origin !== null) headers.set('origin', origin);
  headers.set(
    'sec-fetch-site',
    origin === appOrigin ? 'same-origin' : 'same-site'
  );
  headers.set(
    'cookie',
    sessionCookies.map((name) => `${name}=fixture`).join('; ')
  );
  return dispatchThroughMeetProxy({
    request: new Request(`${appOrigin}/api/auth/logout`, { method, headers }),
    proxy: async () => NextResponse.next(),
    dispatch: async (request) =>
      (await dispatchMeetEndpoint(request)) ??
      new Response(null, { status: 404 }),
    waitUntil: () => {},
  });
}

describe('native Meet logout dispatch authorization', () => {
  it('forwards the same-origin POST request and all host cookie changes', async () => {
    const response = await dispatchLogout('POST');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(5);
    for (const name of sessionCookies) {
      const cookie = cookies.find((value) => value.startsWith(`${name}=`));
      expect(cookie).toContain('Max-Age=0');
      expect(cookie).not.toMatch(/(?:^|;)\s*Domain=/i);
    }
    const marker = cookies.find((value) =>
      value.startsWith(`${APP_LOGOUT_COOKIE_NAME}=1`)
    );
    expect(marker).toContain('HttpOnly');
    expect(marker).toContain('Secure');
    expect(marker).not.toMatch(/(?:^|;)\s*Domain=/i);
  });

  it('refuses GET without setting or clearing cookies', async () => {
    const response = await dispatchLogout('GET');
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST, OPTIONS');
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it.each([
    'https://untrusted.example.test',
    'https://tasks.tuturuuu.com',
    'null',
    null,
  ])(
    'refuses POST with untrusted or missing Origin %s without cookie changes',
    async (origin) => {
      const response = await dispatchLogout('POST', origin);
      expect(response.status).toBe(403);
      expect(response.headers.getSetCookie()).toEqual([]);
    }
  );

  it('dispatches the exported OPTIONS handler with credentialed CORS and no cookies', async () => {
    const response = await dispatchLogout('OPTIONS');
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(appOrigin);
    expect(response.headers.get('access-control-allow-credentials')).toBe(
      'true'
    );
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it.each(['https://tasks.tuturuuu.com', null])(
    'does not bypass preflight authorization for Origin %s',
    async (origin) => {
      const response = await dispatchLogout('OPTIONS', origin);
      expect(response.status).toBe(403);
      expect(response.headers.getSetCookie()).toEqual([]);
    }
  );
});
