import {
  createAppOnlyLogoutHandlers,
  APP_LOGOUT_COOKIE_NAME,
} from '@tuturuuu/auth/app-session';
import {
  dispatchEndpoint,
  lazyRouteModule,
} from '@tuturuuu/start-bridge/endpoints';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const centralOrigin = 'https://tuturuuu.com';
const appOrigin = 'https://calendar.tuturuuu.com';
const handlers = createAppOnlyLogoutHandlers({ centralOrigin });
const strategies = [
  { name: 'eager namespace (Mail and Tasks)', module: handlers },
  {
    name: 'lazy module (Calendar and satellite registries)',
    module: lazyRouteModule(async () => handlers, ['GET', 'POST', 'OPTIONS']),
  },
];

beforeEach(() =>
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://shared.supabase.co')
);
afterEach(() => vi.unstubAllEnvs());

function request(method: string, origin: string | null = appOrigin) {
  const headers = new Headers({
    accept: 'application/json',
    cookie:
      'tuturuuu_app_session=fixture; sb-shared-auth-token=central-fixture',
  });
  if (origin !== null) headers.set('origin', origin);
  headers.set(
    'sec-fetch-site',
    origin === appOrigin ? 'same-origin' : 'same-site'
  );
  return new NextRequest(`${appOrigin}/api/auth/logout`, { method, headers });
}

for (const strategy of strategies) {
  describe(strategy.name, () => {
    const endpoints = [
      { pattern: '/api/auth/logout', module: strategy.module },
    ];
    it('forwards the same-origin POST with shared cookies preserved and a host-only fence', async () => {
      const response = await dispatchEndpoint(endpoints, request('POST'));
      expect(response?.status).toBe(200);
      await expect(response?.json()).resolves.toEqual({ success: true });
      const cookies = response?.headers.getSetCookie() ?? [];
      expect(
        cookies.some((value) => value.startsWith(`${APP_LOGOUT_COOKIE_NAME}=1`))
      ).toBe(true);
      expect(
        cookies.every((value) => !/^(?:sb-shared-auth-token)=/.test(value))
      ).toBe(true);
      expect(cookies.every((value) => !/(?:^|;)\s*Domain=/i.test(value))).toBe(
        true
      );
    });
    it('keeps GET non-mutating', async () => {
      const response = await dispatchEndpoint(endpoints, request('GET'));
      expect(response?.status).toBe(405);
      expect(response?.headers.getSetCookie()).toEqual([]);
    });
    it.each([
      'https://untrusted.example.test',
      'https://tasks.tuturuuu.com',
      'null',
      null,
    ])('rejects POST Origin %s without cookie changes', async (origin) => {
      const response = await dispatchEndpoint(
        endpoints,
        request('POST', origin)
      );
      expect(response?.status).toBe(403);
      expect(response?.headers.getSetCookie()).toEqual([]);
    });
    it('runs the actual preflight handler rather than generic OPTIONS', async () => {
      const response = await dispatchEndpoint(
        endpoints,
        request('OPTIONS', centralOrigin)
      );
      expect(response?.status).toBe(204);
      expect(response?.headers.get('access-control-allow-origin')).toBe(
        centralOrigin
      );
      expect(response?.headers.getSetCookie()).toEqual([]);
    });
    it('rejects an unauthenticated preflight origin', async () => {
      const response = await dispatchEndpoint(
        endpoints,
        request('OPTIONS', null)
      );
      expect(response?.status).toBe(403);
      expect(response?.headers.getSetCookie()).toEqual([]);
    });
  });
}
