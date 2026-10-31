import { resolveAppBase } from '@tuturuuu/start-bridge/mounts';
import type { BridgeAppConfig } from '@tuturuuu/start-bridge/start/app-config';
import { createBridgeHandler } from '@tuturuuu/start-bridge/start/handler';
import { APP_SEO_POLICY, PRIVATE_ROBOTS_HEADER } from '@tuturuuu/utils/seo';
import { NextResponse } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import appConfig from '../../start-bridge.config';

const config: BridgeAppConfig = appConfig;
const canonical = 'inventory.tuturuuu.com';
const staging = 'inventory.staging.tutur3u.com';
const publicFile = '/robots.txt';

function apply(path: string, method = 'GET', host = canonical) {
  const request = new Request(`https://${host}${path}`, { method });
  const response = new Response('fixture', {
    status: 200,
    headers: {
      'Cache-Control': 'private, max-age=600',
      Vary: 'Origin',
      'Set-Cookie': 'fixture=value; HttpOnly',
      'Content-Security-Policy':
        "script-src 'nonce-fixture'; frame-ancestors 'self'",
    },
  });
  return Promise.resolve(
    config.wrapResponse?.(response, { request, env: {} }) ?? response
  );
}

function expectSecurityHeaders(response: Response) {
  expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(response.headers.get('Referrer-Policy')).toBe(
    'strict-origin-when-cross-origin'
  );
  expect(response.headers.get('Content-Security-Policy')).toContain(
    "frame-ancestors 'none'"
  );
  expect(response.headers.get('Content-Security-Policy')).toContain(
    "script-src 'nonce-fixture'"
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('inventory root-only response policy', () => {
  it.each([canonical, staging])('admits only the declared root %s', (host) => {
    const mounts = {
      app: 'inventory',
      rootHosts: [canonical],
      mountHosts: ['tuturuuu.com'],
      basePath: '/inventory',
      ...config.mounts,
    };
    expect(resolveAppBase(new URL(`https://${host}/`), mounts)).toEqual({
      mode: 'root',
      basePath: '',
    });
  });

  it.each([
    'tuturuuu.com',
    'unknown.invalid',
    'inventory.tuturuuu.com.attacker.invalid',
    'tuturuuu-inventory-vite-staging.example.workers.dev',
  ])('rejects apex and unlisted host %s', (host) => {
    const mounts = {
      app: 'inventory',
      rootHosts: [canonical],
      mountHosts: ['tuturuuu.com'],
      basePath: '/inventory',
      ...config.mounts,
    };
    expect(
      resolveAppBase(new URL(`https://${host}/inventory`), mounts)
    ).toBeNull();
  });

  it.each([
    '/',
    '/api/build-info',
    '/api/report.json',
    '/unknown.css',
    '/assets-extra/chunk.js',
  ])('overrides upstream private max-age on %s', async (path) => {
    const response = await apply(path);
    expectSecurityHeaders(response);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(
      response.headers
        .get('Vary')
        ?.split(',')
        .map((value) => value.trim().toLowerCase())
    ).toEqual(['origin', 'cookie']);
    expect(response.headers.get('Set-Cookie')).toBe('fixture=value; HttpOnly');
    expect(await response.text()).toBe('fixture');
  });

  it.each(['GET', 'HEAD'])(
    'exempts actual assets only for %s',
    async (method) => {
      for (const path of ['/assets/chunk.js', publicFile]) {
        const response = await apply(path, method);
        expectSecurityHeaders(response);
        expect(response.headers.get('Cache-Control')).toBe(
          'private, max-age=600'
        );
        expect(response.headers.get('Vary')).toBe('Origin');
      }
    }
  );

  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])(
    'does not grant asset caching to %s',
    async (method) => {
      for (const path of ['/assets/chunk.js', publicFile]) {
        const response = await apply(path, method);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        expect(response.headers.get('Vary')).toContain('Cookie');
      }
    }
  );

  it.each(['0', '1'])(
    'derives robots from app policy even with NOINDEX=%s',
    async (noindex) => {
      vi.stubEnv('TUTURUUU_NOINDEX', noindex);
      for (const path of [
        '/api/build-info',
        '/login',
        '/vi/login',
        '/__unknown__',
      ]) {
        expect((await apply(path)).headers.get('X-Robots-Tag')).toBe(
          PRIVATE_ROBOTS_HEADER
        );
      }
      for (const path of APP_SEO_POLICY.inventory.publicPaths) {
        for (const prefix of ['', '/en', '/vi']) {
          const requestPath = `${prefix}/${path}`;
          expect((await apply(requestPath)).headers.get('X-Robots-Tag')).toBe(
            'index, follow'
          );
          expect(
            (await apply(requestPath, 'GET', staging)).headers.get(
              'X-Robots-Tag'
            )
          ).toBe(PRIVATE_ROBOTS_HEADER);
        }
      }
      expect(
        (await apply('/', 'GET', staging)).headers.get('X-Robots-Tag')
      ).toBe(PRIVATE_ROBOTS_HEADER);
    }
  );
});

const sandboxCsp =
  "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'";
const webglPath =
  '/api/v1/workspaces/workspace/external-projects/assets/asset/webgl';

async function forwarded(path: string) {
  const request = new Request(`https://${canonical}${path}?version=fixture`);
  const upstream = new Response('sandbox fixture', {
    headers: {
      'Content-Security-Policy': sandboxCsp,
      'Cache-Control': 'private, max-age=600',
    },
  });
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(upstream);
  const handler = createBridgeHandler({
    mounts: { app: 'inventory', rootHosts: [canonical], ...config.mounts },
    csp: config.csp,
    proxy: async () => NextResponse.next(),
    start: {
      fetch: () => new Response('Unexpected page dispatch', { status: 500 }),
    },
    assets: () => undefined,
    centralApiOrigin: () => 'https://web-fixture.invalid',
  });
  const response = await handler(request, {}, { waitUntil() {} });
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0]?.[0]).toBeInstanceOf(Request);
  expect(fetcher).toHaveBeenCalledWith(
    expect.objectContaining({
      url: `https://web-fixture.invalid${path}?version=fixture`,
    })
  );
  return Promise.resolve(
    config.wrapResponse?.(response, { request, env: {} }) ?? response
  );
}

describe('inventory central WebGL sandbox boundary', () => {
  it.each([webglPath, `${webglPath}/Build/index.html`])(
    'preserves the upstream sandbox exactly for %s',
    async (path) => {
      const response = await forwarded(path);
      expect(response.headers.get('Content-Security-Policy')).toBe(sandboxCsp);
      expect(response.headers.get('X-Frame-Options')).toBeNull();
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      expect(response.headers.get('Vary')).toContain('Cookie');
      expect(await response.text()).toBe('sandbox fixture');
    }
  );

  it.each([`${webglPath}-preview`, `${webglPath}ish`])(
    'keeps the neighbouring path denied: %s',
    async (path) => {
      const response = await forwarded(path);
      expect(response.headers.get('Content-Security-Policy')).toContain(
        "frame-ancestors 'none'"
      );
      expect(response.headers.get('Content-Security-Policy')).toContain(
        sandboxCsp
      );
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    }
  );
});

describe('inventory CSP policy lists', () => {
  it.each([
    {
      csp: "frame-ancestors 'self', script-src 'nonce-second'; img-src https://images.invalid",
      expected:
        "frame-ancestors 'none', script-src 'nonce-second'; img-src https://images.invalid; frame-ancestors 'none'",
    },
    {
      csp: "script-src 'nonce-first'; frame-ancestors 'self', frame-ancestors 'self'; img-src https://images.invalid",
      expected:
        "script-src 'nonce-first'; frame-ancestors 'none', img-src https://images.invalid; frame-ancestors 'none'",
    },
  ])(
    'retains every policy and its non-framing directives: $csp',
    async ({ csp, expected }) => {
      const request = new Request(`https://${canonical}/login`);
      const response = await config.wrapResponse?.(
        new Response('fixture', {
          headers: { 'Content-Security-Policy': csp },
        }),
        { request, env: {} }
      );
      expect(response?.headers.get('Content-Security-Policy')).toBe(expected);
      expect(response?.headers.get('X-Frame-Options')).toBe('DENY');
      expect(await response?.text()).toBe('fixture');
    }
  );
});
