import {
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

describe('native Mail logout supplier and cookie bridge', () => {
  for (const method of ['GET', 'POST'])
    it(`clears all four session cookies through ${method}`, async () => {
      const request = new Request('https://mail.tuturuuu.com/api/auth/logout', {
        method,
      });
      const response = applyMailResponsePolicy(
        request,
        await dispatchThroughMailProxy({
          request,
          waitUntil: () => {},
          proxy: async () => NextResponse.next(),
          dispatch: async () => (method === 'POST' ? POST() : GET()),
        })
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true });
      const cookies = response.headers.getSetCookie();
      expect(cookies).toHaveLength(4);
      for (const name of [
        APP_SESSION_COOKIE_NAME,
        APP_SESSION_REFRESH_COOKIE_NAME,
        WEB_APP_SESSION_COOKIE_NAME,
        WEB_APP_SESSION_REFRESH_COOKIE_NAME,
      ])
        expect(
          cookies.some(
            (cookie) =>
              cookie.startsWith(`${name}=`) && cookie.includes('Max-Age=0')
          )
        ).toBe(true);
    });
});
