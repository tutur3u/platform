import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  definePageAdapterTests,
  pageAdapterMocks,
} from '../../../packages/auth/src/proxy/page-adapter-test-fixture';

vi.mock('next-intl/middleware', () => ({
  default: () => pageAdapterMocks.continuation,
}));
vi.mock('next-intl/navigation', () => ({
  createNavigation: () => ({}),
}));

import { proxy } from './proxy';

definePageAdapterTests({
  proxy,
  targetApp: 'forms',
  publicPaths: ['/f/share', '/embed/share'],
  anonymousApis: [
    { path: '/api/v1/shared/forms/share', method: 'GET' },
    { path: '/api/v1/shared/forms/share', method: 'POST' },
  ],
});

describe('mounted Forms shared-session boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fixture.supabase.co');
    pageAdapterMocks.continuation.mockImplementation(() => NextResponse.next());
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    '/forms/f/share',
    '/forms/embed/share',
    '/forms/vi/f/share',
    '/forms/api/v1/shared/forms/share',
    '/forms/api/v1/shared/forms/share/response-copy',
    '/forms/workspace/private',
    '/forms/verify-token?token=untrusted',
  ])('does not refresh or write a session for %s', async (path) => {
    const response = await proxy(
      new NextRequest(`https://tuturuuu.com${path}`, {
        method: path.includes('/api/') ? 'POST' : 'GET',
        nextConfig: { basePath: '/forms' },
        headers: { cookie: 'sb-fixture-auth-token=shared' },
      })
    );
    expect(pageAdapterMocks.refresh).not.toHaveBeenCalled();
    expect(
      response.headers
        .getSetCookie()
        .filter((cookie) =>
          /^(?:tuturuuu_app_session|sb-[^=]+-auth-token)/u.test(cookie)
        )
    ).toEqual([]);
    if (path.includes('/vi/'))
      expect(response.headers.get('location')).toBe(
        'https://tuturuuu.com/forms/f/share'
      );
    else if (path.includes('/verify-token'))
      expect(response.headers.get('location')).toBe(
        'https://tuturuuu.com/forms/login'
      );
    else expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it.each(['GET', 'POST'])(
    'allows anonymous mounted shared form %s',
    async (method) => {
      const response = await proxy(
        new NextRequest(
          'https://tuturuuu.com/forms/api/v1/shared/forms/share',
          {
            method,
            nextConfig: { basePath: '/forms' },
          }
        )
      );
      expect(response.headers.get('x-middleware-next')).toBe('1');
      expect(pageAdapterMocks.refresh).not.toHaveBeenCalled();
      expect(response.headers.getSetCookie()).toEqual([]);
    }
  );

  it('redirects an anonymous operator to the mounted login', async () => {
    const response = await proxy(
      new NextRequest('https://tuturuuu.com/forms/workspace/private?tab=one', {
        nextConfig: { basePath: '/forms' },
      })
    );
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.pathname).toBe('/forms/login');
    expect(location.searchParams.get('next')).toBe(
      '/workspace/private?tab=one'
    );
    expect(pageAdapterMocks.continuation).not.toHaveBeenCalled();
    expect(pageAdapterMocks.refresh).not.toHaveBeenCalled();
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it.each(['refresh-app-session', 'verify-app-token', 'logout'])(
    'rejects mounted session writer %s',
    async (endpoint) => {
      const response = await proxy(
        new NextRequest(`https://tuturuuu.com/forms/api/auth/${endpoint}`, {
          method: 'POST',
          nextConfig: { basePath: '/forms' },
        })
      );
      expect(response.status).toBe(409);
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(pageAdapterMocks.refresh).not.toHaveBeenCalled();
      expect(pageAdapterMocks.continuation).not.toHaveBeenCalled();
    }
  );
});

describe('public Forms build identity', () => {
  beforeEach(() => {
    pageAdapterMocks.refresh
      .mockReset()
      .mockResolvedValue({ ok: false, error: 'Token expired' });
  });
  it.each([
    ['GET', false],
    ['GET', true],
    ['HEAD', false],
    ['HEAD', true],
  ])(
    'keeps %s independent of ambient sessions (cookies=%s)',
    async (method, cookies) => {
      const request = new NextRequest(
        'https://forms.tuturuuu.com/api/build-info',
        {
          method,
          headers: cookies
            ? {
                cookie:
                  'tuturuuu_app_session=expired; sb-example-auth-token=expired',
                authorization: 'Bearer expired',
              }
            : {},
        }
      );
      const response = await proxy(request);
      expect(response.headers.get('x-middleware-next')).toBe('1');
      expect(pageAdapterMocks.refresh).not.toHaveBeenCalled();
      expect(request.headers.get('cookie')).toBeNull();
      expect(request.headers.get('authorization')).toBeNull();
      expect(response.headers.getSetCookie()).toEqual([]);
    }
  );
  it.each(['/api/build-info/private', '/api/v1/workspaces/ws/forms'])(
    'preserves the session guard for %s',
    async (path) => {
      const response = await proxy(
        new NextRequest(`https://forms.tuturuuu.com${path}`)
      );
      expect(pageAdapterMocks.refresh).toHaveBeenCalledOnce();
      expect(response.status).toBe(401);
    }
  );
});
