import { isRedirect } from '@tanstack/router-core';
import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { describe, expect, it, vi } from 'vitest';
import { createBasePath, OUTSIDE_APP_LOCATION_HEADER } from '../core/base-path';
import { redirect } from '../rsc/navigation';
import { withBridgeRequest } from '../server/request-context';
import { createBridgeHandler } from './handler';

const WEB_LOGIN_PATH = '/login?returnUrl=%2Finventory%2Fpersonal';
const WEB_LOGIN = `https://tuturuuu.com${WEB_LOGIN_PATH}`;

function thrown(run: () => unknown) {
  try {
    run();
  } catch (error) {
    return error as { options: { href: string; reloadDocument?: boolean } };
  }
  throw new Error('expected a redirect');
}

/**
 * Start's response for a thrown redirect: router-core `resolveRedirect`
 * keeps only the path of a same-origin absolute href.
 */
function startResponse(error: { options: { href: string } }, origin: string) {
  const url = new URL(error.options.href, origin);
  const location =
    url.origin === origin
      ? `${url.pathname}${url.search}${url.hash}`
      : url.href;
  return new Response(null, { status: 307, headers: { location } });
}

describe('absolute redirects', () => {
  it('keep app paths on the mount and flag same-origin targets outside it', async () => {
    const responseHeaders = new Headers();
    await withBridgeRequest(
      {
        request: new Request('https://tuturuuu.com/inventory/login'),
        appBase: '/inventory',
        responseHeaders,
      },
      async () => {
        expect(thrown(() => redirect('/personal')).options.href).toBe(
          '/inventory/personal'
        );
        const external = thrown(() => redirect(WEB_LOGIN));
        expect(isRedirect(external)).toBe(true);
        expect(external.options).toMatchObject({
          href: WEB_LOGIN,
          reloadDocument: true,
        });
      }
    );
    expect(responseHeaders.get(OUTSIDE_APP_LOCATION_HEADER)).toBe(
      WEB_LOGIN_PATH
    );
    // Cross-origin targets stay absolute in the router: no flag.
    const crossOrigin = new Headers();
    await withBridgeRequest(
      {
        request: new Request('https://inventory.tuturuuu.com/login'),
        responseHeaders: crossOrigin,
      },
      async () => thrown(() => redirect(WEB_LOGIN))
    );
    expect(crossOrigin.has(OUTSIDE_APP_LOCATION_HEADER)).toBe(false);
  });

  it('leaves the apex mount for a same-origin target outside it (no login loop)', async () => {
    const start = vi.fn(async (request: Request) => {
      if (!new URL(request.url).pathname.endsWith('/login'))
        return new Response('page');
      // The login page sends anonymous users to Web's absolute login URL.
      return startResponse(
        thrown(() => redirect(WEB_LOGIN)),
        new URL(request.url).origin
      );
    });
    const handle = createBridgeHandler<
      { ASSETS: { fetch(request: Request): Promise<Response> } },
      { waitUntil(work: Promise<unknown>): void }
    >({
      mounts: {
        app: 'inventory',
        rootHosts: ['inventory.tuturuuu.com'],
        mountHosts: ['tuturuuu.com'],
        basePath: '/inventory',
      },
      start: { fetch: start },
      proxy: async () => NextResponse.next(),
      assets: (env) => env.ASSETS,
      centralApiOrigin: () => 'https://tuturuuu.com',
    });
    const env = { ASSETS: { fetch: async () => new Response('asset') } };
    const ctx = { waitUntil: vi.fn() };
    const apex = await handle(
      new Request('https://tuturuuu.com/inventory/login?next=/personal'),
      env,
      ctx
    );
    expect(apex.status).toBe(307);
    const location = apex.headers.get('location') ?? '';
    // Path-absolute on tuturuuu.com: Web's login, not /inventory/login.
    expect(location).toBe(WEB_LOGIN_PATH);
    expect(new URL(location, 'https://tuturuuu.com/inventory/login').href).toBe(
      WEB_LOGIN
    );
    expect(apex.headers.has(OUTSIDE_APP_LOCATION_HEADER)).toBe(false);
    // The subdomain root stays cross-origin and absolute as before.
    const root = await handle(
      new Request('https://inventory.tuturuuu.com/login'),
      env,
      ctx
    );
    expect(root.headers.get('location')).toBe(WEB_LOGIN);
  });
});

describe('finalizeResponse with the outside-app flag', () => {
  const mounted = createBasePath({ app: 'inventory', basePath: '/inventory' });
  const redirectTo = (location: string, flag?: string) =>
    new Response(null, {
      status: 307,
      headers: {
        location,
        ...(flag ? { [OUTSIDE_APP_LOCATION_HEADER]: flag } : {}),
      },
    });

  it('leaves only the flagged path unprefixed and strips the flag', () => {
    const outside = mounted.finalizeResponse(
      redirectTo(WEB_LOGIN_PATH, WEB_LOGIN_PATH)
    );
    expect(outside.headers.get('location')).toBe(WEB_LOGIN_PATH);
    expect(outside.headers.has(OUTSIDE_APP_LOCATION_HEADER)).toBe(false);
    // A flag only withholds the prefix from a matching path: it never names
    // a new destination, and a mismatched flag is re-based as usual.
    for (const flag of ['https://attacker.test/personal', '/other']) {
      const response = mounted.finalizeResponse(redirectTo('/personal', flag));
      expect(response.headers.get('location')).toBe('/inventory/personal');
      expect(response.headers.has(OUTSIDE_APP_LOCATION_HEADER)).toBe(false);
    }
    expect(
      mounted.finalizeResponse(redirectTo('/personal')).headers.get('location')
    ).toBe('/inventory/personal');
  });

  it('strips the flag at the root too', () => {
    const root = createBasePath({ app: 'inventory' });
    const response = root.finalizeResponse(
      redirectTo(WEB_LOGIN_PATH, WEB_LOGIN_PATH)
    );
    expect(response.headers.get('location')).toBe(WEB_LOGIN_PATH);
    expect(response.headers.has(OUTSIDE_APP_LOCATION_HEADER)).toBe(false);
  });
});
