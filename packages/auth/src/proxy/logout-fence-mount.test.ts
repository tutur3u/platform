import './required-mfa-test-fixture';
import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { APP_LOGOUT_COOKIE_NAME } from '../app-session-core';
import {
  appLogoutFenceResponse,
  isAppLogoutFenceExemptPath,
} from './logout-fence';

vi.mock('@tuturuuu/supabase/next/proxy', () => ({ updateSession: vi.fn() }));

// D304h L2 / D360 R5: the logout fence exemptions hold under a mount base.
const fenced = { cookie: `${APP_LOGOUT_COOKIE_NAME}=1` };
const login = () => new URL('https://tuturuuu.com/login');
const EXEMPT = [
  '/verify-token',
  '/en/verify-token',
  '/vi/verify-token',
  '/api/auth/verify-app-token',
  '/api/auth/logout',
  '/api/auth/logout/',
];

describe('logout fence on the tuturuuu.com/hive mount', () => {
  it.each(EXEMPT)(
    'exempts /hive%s when the request carries Next basePath',
    (path) => {
      const request = new NextRequest(`https://tuturuuu.com/hive${path}`, {
        headers: fenced,
        nextConfig: { basePath: '/hive' },
      });
      expect(appLogoutFenceResponse(request, login)).toBeNull();
    }
  );

  it.each(EXEMPT)(
    'exempts /hive%s from the explicit mount base without Next basePath',
    (path) => {
      const request = new NextRequest(`https://tuturuuu.com/hive${path}`, {
        headers: fenced,
      });
      expect(
        appLogoutFenceResponse(request, login, { basePath: '/hive' })
      ).toBeNull();
    }
  );

  it('still fences mounted pages and APIs', async () => {
    for (const nextConfig of [{ basePath: '/hive' }, undefined]) {
      const page = appLogoutFenceResponse(
        new NextRequest('https://tuturuuu.com/hive/en/dashboard', {
          headers: fenced,
          nextConfig,
        }),
        login,
        { basePath: '/hive' }
      );
      expect(page?.status).toBe(307);
      expect(page?.headers.get('location')).toBe(
        'https://tuturuuu.com/login?confirmAccount=1'
      );
      const api = appLogoutFenceResponse(
        new NextRequest('https://tuturuuu.com/hive/api/v1/workspaces', {
          headers: fenced,
          nextConfig,
        }),
        login,
        { basePath: '/hive' }
      );
      expect(api?.status).toBe(401);
    }
  });

  it('never lets a look-alike base or path through', () => {
    for (const path of [
      '/hiveful/verify-token',
      '/hive/verify-tokens',
      '/hive/api/auth/logout-all',
      '/hive/fr/verify-token',
      '/other/hive/verify-token',
    ])
      expect(isAppLogoutFenceExemptPath(path, '/hive')).toBe(false);
  });

  it('keeps root (subdomain) behaviour unchanged', () => {
    expect(isAppLogoutFenceExemptPath('/vi/verify-token')).toBe(true);
    expect(isAppLogoutFenceExemptPath('/hive/verify-token')).toBe(false);
    expect(
      appLogoutFenceResponse(
        new NextRequest('https://hive.tuturuuu.com/verify-token', {
          headers: fenced,
        }),
        login
      )
    ).toBeNull();
  });
});
