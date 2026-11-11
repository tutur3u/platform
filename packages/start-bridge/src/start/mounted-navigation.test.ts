import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { describe, expect, it, vi } from 'vitest';
import { createBasePath } from '../core/base-path';
import { defineBridgeAppConfig } from './app-config';
import { createBridgeHandler } from './handler';
import {
  canonicalizeMountedTrailingSlash,
  mountedTrailingSlashEnabled,
} from './mounted-navigation';

const origin = 'https://tuturuuu.com';
const ctx = { waitUntil: vi.fn() };
const navigation = (
  path: string,
  method = 'GET',
  headers: Record<string, string> = {}
) =>
  new Request(`${origin}${path}`, {
    method,
    headers: { accept: 'text/html', ...headers },
  });

// Both generic app names exercise the shared implementation, with no app config enabled.
describe.each(['fixture', 'another-app'])(
  'mounted %s canonicalization',
  (app) => {
    const base = createBasePath({ app, basePath: `/${app}` });
    const canonical = (path: string, method = 'GET') =>
      canonicalizeMountedTrailingSlash(navigation(path, method), base, {
        enabled: true,
      });
    it.each(['GET', 'HEAD'])(
      'returns one 301 for %s slash forms without reserializing the query',
      (method) => {
        for (const suffix of [
          '/',
          '//',
          '/x/',
          '/x//',
          '/a%2Fb/',
          '/caf%C3%A9/',
          '/x//y/',
        ]) {
          const query = '?x=1&x=2&q=a%2Bb&empty=&encoded=%2f';
          const path = `/${app}${suffix}`;
          const response = canonical(`${path}${query}`, method);
          expect(response?.status).toBe(301);
          expect(response?.headers.get('location')).toBe(
            `${origin}${path.replace(/\/+$/u, '')}${query}`
          );
          expect(response?.headers.getSetCookie()).toEqual([]);
        }
      }
    );
    it.each(['/api', '/assets', '/.well-known', '/_serverFn'])(
      'leaves %s machine paths untouched, including repeated separators',
      (prefix) => {
        for (const path of [
          `/${app}${prefix}/`,
          `/${app}${prefix}/x/`,
          `/${app}/${prefix}/x/`,
        ])
          expect(canonical(path)).toBeNull();
      }
    );
    it('leaves custom server function transports untouched', () => {
      expect(
        canonicalizeMountedTrailingSlash(navigation(`/${app}/_fn/x/`), base, {
          enabled: true,
          machinePathPrefixes: ['/_fn'],
        })
      ).toBeNull();
    });
    it('preserves bare mount, root hosts and unowned paths', () => {
      expect(canonical(`/${app}?x=1&x=2`)).toBeNull();
      expect(canonical(`/${app}ish/x/`)).toBeNull();
      expect(
        canonicalizeMountedTrailingSlash(
          navigation('/x/'),
          createBasePath({ app }),
          { enabled: true }
        )
      ).toBeNull();
    });
    it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])(
      'leaves %s untouched and does not consume the request',
      (method) => {
        const request = new Request(`${origin}/${app}/x/`, {
          method,
          body: 'bytes',
          headers: { accept: 'text/html' },
        });
        expect(
          canonicalizeMountedTrailingSlash(request, base, { enabled: true })
        ).toBeNull();
        expect(request.bodyUsed).toBe(false);
      }
    );
    it('requires navigation and excludes upgrades', () => {
      for (const request of [
        new Request(`${origin}/${app}/x/`),
        navigation(`/${app}/x/`, 'GET', { 'sec-fetch-mode': 'cors' }),
        navigation(`/${app}/x/`, 'GET', { upgrade: 'websocket' }),
      ])
        expect(
          canonicalizeMountedTrailingSlash(request, base, { enabled: true })
        ).toBeNull();
      expect(
        canonicalizeMountedTrailingSlash(
          new Request(`${origin}/${app}/x/`, {
            headers: { 'sec-fetch-mode': 'navigate' },
          }),
          base,
          { enabled: true }
        )?.status
      ).toBe(301);
    });
    it('defaults off and leaves false unchanged', () => {
      for (const options of [undefined, {}, { enabled: false }])
        expect(
          canonicalizeMountedTrailingSlash(
            navigation(`/${app}/`),
            base,
            options
          )
        ).toBeNull();
      expect(mountedTrailingSlashEnabled(undefined, {})).toBe(false);
    });
  }
);

it('uses a per-app config predicate with missing variables off', () => {
  const config = defineBridgeAppConfig<{ MODE?: string }>({
    mountedTrailingSlash: (env) => env.MODE === 'on',
  });
  expect(mountedTrailingSlashEnabled(config.mountedTrailingSlash, {})).toBe(
    false
  );
  expect(
    mountedTrailingSlashEnabled(config.mountedTrailingSlash, { MODE: 'on' })
  ).toBe(true);
});

it.each([undefined, false, true])(
  'runs before a router 307 only when the config opts in (%s)',
  async (enabled) => {
    const config = defineBridgeAppConfig({ mountedTrailingSlash: enabled });
    const proxy = vi.fn(async () => NextResponse.next());
    const start = vi.fn(
      async () =>
        new Response(null, {
          status: 307,
          headers: { location: '/fixture?x=1&x=2' },
        })
    );
    const handle = createBridgeHandler({
      ...config,
      mounts: {
        app: 'fixture',
        rootHosts: ['fixture.test'],
        mountHosts: ['tuturuuu.com'],
        basePath: '/fixture',
      },
      proxy,
      start: { fetch: start },
      assets: () => undefined,
      centralApiOrigin: () => 'https://web.test',
    });
    const response = await handle(navigation('/fixture/?x=1&x=2'), {}, ctx);
    expect(response.status).toBe(enabled ? 301 : 307);
    expect(response.headers.get('location')).toBe(
      enabled ? `${origin}/fixture?x=1&x=2` : '/fixture?x=1&x=2'
    );
    expect(proxy).toHaveBeenCalledTimes(enabled ? 0 : 1);
    expect(start).toHaveBeenCalledTimes(enabled ? 0 : 1);
  }
);

it('passes bare mounted documents to SSR without an external slash hop', async () => {
  const start = vi.fn(async (request: Request) => new Response(request.url));
  const handle = createBridgeHandler({
    mountedTrailingSlash: true,
    mounts: {
      app: 'fixture',
      rootHosts: ['fixture.test'],
      mountHosts: ['tuturuuu.com'],
      basePath: '/fixture',
    },
    proxy: async () => NextResponse.next(),
    start: { fetch: start },
    assets: () => undefined,
    centralApiOrigin: () => 'https://web.test',
  });
  const response = await handle(navigation('/fixture?x=1&x=2'), {}, ctx);
  expect(response.status).toBe(200);
  expect(await response.text()).toBe(`${origin}/fixture?x=1&x=2`);
  expect(response.headers.get('location')).toBeNull();
});
