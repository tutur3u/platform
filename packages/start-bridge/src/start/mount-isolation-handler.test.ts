import { appLogoutFenceResponse } from '@tuturuuu/auth/proxy/logout-fence';
import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBridgeHandler } from './handler';

// D360: a Hive-shaped mount with same-origin isolation, run through the
// whole bridge handler (admission, proxy.ts, endpoints, forwards, response).
const seen: Array<{ path: string; cookie: string | null }> = [];
const fetcher = vi.fn(
  async (_request: Request) =>
    new Response('central', {
      headers: [
        ['set-cookie', 'sb-ref-auth-token=; Path=/; Max-Age=0'],
        ['set-cookie', 'NEXT_LOCALE=en; Path=/; Domain=.tuturuuu.com'],
      ],
    })
);

function createHandle(isolation = { ownedCookies: ['NEXT_LOCALE'] }) {
  return createBridgeHandler<
    Record<string, never>,
    { waitUntil(work: Promise<unknown>): void }
  >({
    mounts: {
      app: 'hive',
      rootHosts: ['hive.tuturuuu.com'],
      mountHosts: ['tuturuuu.com'],
      basePath: '/hive',
      unknownHost: 'reject',
      isolation,
    },
    start: {
      fetch: async (request) => {
        seen.push({
          path: `start:${new URL(request.url).pathname}`,
          cookie: request.headers.get('cookie'),
        });
        const response = new Response('<html></html>', {
          headers: { 'content-type': 'text/html' },
        });
        response.headers.append('set-cookie', 'NEXT_LOCALE=vi; Path=/');
        response.headers.append(
          'set-cookie',
          'sb-ref-auth-token=rotated; Path=/; Domain=.tuturuuu.com'
        );
        response.headers.append('set-cookie', 'sidebar_state=true; Path=/');
        return response;
      },
    },
    proxy: async (request) => {
      seen.push({
        path: request.nextUrl.pathname,
        cookie: request.headers.get('cookie'),
      });
      return (
        appLogoutFenceResponse(
          request,
          () => new URL('https://tuturuuu.com/login')
        ) ?? NextResponse.next()
      );
    },
    apiOrigin: (_request, { path }) =>
      path.startsWith('/api/third-party') ? 'https://third.example' : undefined,
    assets: () => undefined,
    centralApiOrigin: () => 'https://tuturuuu.com',
  });
}

vi.stubGlobal('fetch', fetcher);
const handle = createHandle();
const ctx = { waitUntil: vi.fn() };
const SESSION = `base64-${btoa(
  JSON.stringify({
    access_token: 'access.fixture',
    refresh_token: 'refresh-fixture',
    expires_at: 2_000_000_000,
  })
)
  .replaceAll('+', '-')
  .replaceAll('/', '_')
  .replace(/=+$/u, '')}`;
const APEX_COOKIES = [
  'NEXT_LOCALE=vi',
  `sb-ref-auth-token=${SESSION}`,
  'tuturuuu_web_app_session=web-fixture',
  'tuturuuu_web_account_device=device-fixture',
  'sidebar_state=true',
].join('; ');

afterEach(() => {
  seen.length = 0;
  fetcher.mockClear();
});

describe('isolated tuturuuu.com/hive mount', () => {
  it('hands app code only owned cookies and an access-only session', async () => {
    const response = await handle(
      new Request('https://tuturuuu.com/hive/en/dashboard', {
        headers: { cookie: APEX_COOKIES },
      }),
      {},
      ctx
    );
    expect(response.status).toBe(200);
    expect(seen.length).toBeGreaterThan(0);
    for (const { cookie } of seen) {
      expect(cookie).toContain('NEXT_LOCALE=vi');
      expect(cookie).toContain('sb-ref-auth-token=base64-');
      for (const secret of [
        'refresh-fixture',
        'web-fixture',
        'device-fixture',
        'sidebar_state',
      ])
        expect(cookie).not.toContain(secret);
    }
  });

  it('writes only NEXT_LOCALE, host-only at Path=/hive', async () => {
    const response = await handle(
      new Request('https://tuturuuu.com/hive/en/dashboard', {
        headers: { cookie: APEX_COOKIES },
      }),
      {},
      ctx
    );
    expect(response.headers.getSetCookie()).toEqual([
      'NEXT_LOCALE=vi; Path=/hive; Secure',
    ]);
  });

  it('forwards the access-only session to the central API and drops its writes', async () => {
    const response = await handle(
      new Request('https://tuturuuu.com/hive/api/v1/workspaces', {
        headers: { cookie: APEX_COOKIES },
      }),
      {},
      ctx
    );
    const forwarded = fetcher.mock.calls[0]?.[0] as Request;
    expect(new URL(forwarded.url).origin).toBe('https://tuturuuu.com');
    expect(forwarded.headers.get('cookie')).toContain('sb-ref-auth-token=');
    expect(forwarded.headers.get('cookie')).not.toContain('refresh-fixture');
    expect(response.headers.getSetCookie()).toEqual([
      'NEXT_LOCALE=en; Path=/hive; Secure',
    ]);
  });

  it('sends no cookies or Authorization to an upstream Hive does not own', async () => {
    await handle(
      new Request('https://tuturuuu.com/hive/api/third-party/x', {
        headers: { authorization: 'Bearer app-fixture', cookie: APEX_COOKIES },
      }),
      {},
      ctx
    );
    const forwarded = fetcher.mock.calls[0]?.[0] as Request;
    expect(new URL(forwarded.url).origin).toBe('https://third.example');
    expect(forwarded.headers.get('cookie')).toBeNull();
    expect(forwarded.headers.get('authorization')).toBeNull();
  });

  it('keeps the logout fence and its basePath-aware exemptions', async () => {
    const cookie = `__Host-tuturuuu_app_signed_out=1; ${APEX_COOKIES}`;
    const verify = await handle(
      new Request('https://tuturuuu.com/hive/vi/verify-token', {
        headers: { cookie },
      }),
      {},
      ctx
    );
    expect(verify.status).toBe(200);
    expect(seen[0]?.path).toBe('/vi/verify-token');
    expect(seen[0]?.cookie).toContain('__Host-tuturuuu_app_signed_out=1');

    const page = await handle(
      new Request('https://tuturuuu.com/hive/en/dashboard', {
        headers: { cookie },
      }),
      {},
      ctx
    );
    expect(page.status).toBe(307);
    expect(page.headers.get('location')).toBe(
      'https://tuturuuu.com/login?confirmAccount=1'
    );

    const api = await handle(
      new Request('https://tuturuuu.com/hive/api/v1/workspaces', {
        headers: { cookie },
      }),
      {},
      ctx
    );
    expect(api.status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('forwards a fenced same-origin logout to Web and refuses minting', async () => {
    const cookie = `__Host-tuturuuu_app_signed_out=1; ${APEX_COOKIES}`;
    const logout = await handle(
      new Request('https://tuturuuu.com/hive/api/auth/logout', {
        method: 'POST',
        headers: { cookie, 'sec-fetch-site': 'same-origin' },
      }),
      {},
      ctx
    );
    expect(logout.status).toBe(200);
    const forwardedLogout = fetcher.mock.calls[0]?.[0];
    expect(forwardedLogout && new URL(forwardedLogout.url).pathname).toBe(
      '/api/auth/logout'
    );
    for (const path of [
      '/hive/api/auth/verify-app-token',
      '/hive/api/auth/refresh-app-session',
    ]) {
      const refused = await handle(
        new Request(`https://tuturuuu.com${path}`, {
          method: 'POST',
          headers: { cookie, 'sec-fetch-site': 'same-origin' },
        }),
        {},
        ctx
      );
      expect(refused.status).toBe(409);
      expect(refused.headers.getSetCookie()).toEqual([]);
    }
  });

  it('leaves hive.tuturuuu.com (root mode) untouched', async () => {
    const response = await handle(
      new Request('https://hive.tuturuuu.com/en/dashboard', {
        headers: { cookie: APEX_COOKIES },
      }),
      {},
      ctx
    );
    expect(seen[0]?.cookie).toBe(APEX_COOKIES);
    expect(response.headers.getSetCookie()).toEqual([
      'NEXT_LOCALE=vi; Path=/',
      'sb-ref-auth-token=rotated; Path=/; Domain=.tuturuuu.com',
      'sidebar_state=true; Path=/',
    ]);
  });

  it('refuses an isolation policy that claims a session cookie', () => {
    expect(() =>
      createHandle({ ownedCookies: ['sb-ref-auth-token'] })
    ).toThrow();
  });
});
