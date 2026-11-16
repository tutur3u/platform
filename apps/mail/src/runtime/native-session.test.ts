import {
  APP_LOGOUT_COOKIE_NAME,
  APP_SESSION_COOKIE_NAME,
  APP_SESSION_REFRESH_COOKIE_NAME,
  WEB_APP_SESSION_COOKIE_NAME,
  WEB_APP_SESSION_REFRESH_COOKIE_NAME,
} from '@tuturuuu/auth/app-session';
import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { describe, expect, it } from 'vitest';
import { GET, POST } from '../app/api/auth/logout/route';
import { dispatchThroughMailProxy } from './proxy-bridge';
import { applyMailResponsePolicy } from './response-policy';

const appOrigin = 'https://mail.tuturuuu.com';
const sessionCookies = [
  APP_SESSION_COOKIE_NAME,
  APP_SESSION_REFRESH_COOKIE_NAME,
  WEB_APP_SESSION_COOKIE_NAME,
  WEB_APP_SESSION_REFRESH_COOKIE_NAME,
];

async function logoutThroughBridge(method: 'GET' | 'POST', origin = appOrigin) {
  const request = new Request(`${appOrigin}/api/auth/logout`, {
    method,
    headers: {
      accept: 'application/json',
      origin,
      'sec-fetch-site': origin === appOrigin ? 'same-origin' : 'cross-site',
      cookie: sessionCookies.map((name) => `${name}=fixture`).join('; '),
    },
  });
  return applyMailResponsePolicy(
    request,
    await dispatchThroughMailProxy({
      request,
      waitUntil: () => {},
      proxy: async () => NextResponse.next(),
      dispatch: async (forwarded) =>
        method === 'POST' ? POST(forwarded) : GET(forwarded),
    })
  );
}

describe('native Mail logout supplier and cookie bridge', () => {
  it('refuses GET without clearing a session', async () => {
    const response = await logoutThroughBridge('GET');
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST, OPTIONS');
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it('clears the four host session cookies and preserves the signed-out marker through POST', async () => {
    const response = await logoutThroughBridge('POST');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
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
    expect(marker).toContain('Secure');
    expect(marker).toContain('HttpOnly');
    expect(marker).not.toContain('Max-Age=0');
    expect(marker).not.toMatch(/(?:^|;)\s*Domain=/i);
  });

  it('refuses an untrusted POST origin without emitting session cookie changes', async () => {
    const response = await logoutThroughBridge(
      'POST',
      'https://untrusted.example.test'
    );
    expect(response.status).toBe(403);
    expect(response.headers.getSetCookie()).toEqual([]);
  });
});
