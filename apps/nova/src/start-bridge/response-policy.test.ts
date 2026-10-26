import { resolveAppBase } from '@tuturuuu/start-bridge/mounts';
import type { BridgeAppConfig } from '@tuturuuu/start-bridge/start/app-config';
import { APP_SEO_POLICY, PRIVATE_ROBOTS_HEADER } from '@tuturuuu/utils/seo';
import { afterEach, describe, expect, it, vi } from 'vitest';
import appConfig from '../../start-bridge.config';

const config: BridgeAppConfig = appConfig;
const canonical = 'nova.tuturuuu.com';
const staging = 'nova-staging.tuturuuu.com';
const publicFile = '/favicon.ico';

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

afterEach(() => vi.unstubAllEnvs());

describe('nova root-only response policy', () => {
  it.each([canonical, staging])('admits only the declared root %s', (host) => {
    const mounts = {
      app: 'nova',
      rootHosts: [canonical],
      mountHosts: ['tuturuuu.com'],
      basePath: '/nova',
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
    'nova.tuturuuu.com.attacker.invalid',
    'tuturuuu-nova-vite-staging.example.workers.dev',
  ])('rejects apex and unlisted host %s', (host) => {
    const mounts = {
      app: 'nova',
      rootHosts: [canonical],
      mountHosts: ['tuturuuu.com'],
      basePath: '/nova',
      ...config.mounts,
    };
    expect(resolveAppBase(new URL(`https://${host}/nova`), mounts)).toBeNull();
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
      for (const path of APP_SEO_POLICY.nova.publicPaths) {
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
