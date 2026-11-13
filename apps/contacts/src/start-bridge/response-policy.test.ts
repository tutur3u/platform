import { resolveAppBase } from '@tuturuuu/start-bridge/mounts';
import type { BridgeAppConfig } from '@tuturuuu/start-bridge/start/app-config';
import { PRIVATE_ROBOTS_HEADER } from '@tuturuuu/utils/seo';
import { describe, expect, it } from 'vitest';
import appConfig from '../../start-bridge.config';

const config: BridgeAppConfig = appConfig;
const canonical = 'contacts.tuturuuu.com';

// The generated Worker composes its mounts exactly like this: codemod
// defaults, then the app-owned start-bridge.config.ts overrides.
const mounts = {
  app: 'contacts',
  rootHosts: ['contacts.tuturuuu.com'],
  mountHosts: ['tuturuuu.com'],
  basePath: '/contacts',
  ...config.mounts,
};

// The app's seo-policy.json entry, as the generated Worker inlines it.
const seoPolicy = {
  origin: 'https://contacts.tuturuuu.com',
  localePrefix: 'never',
  publicPaths: [],
  publicPatterns: [],
};

function apply(path: string, method = 'GET', host = 'tuturuuu.com') {
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
    config.wrapResponse?.(response, {
      request,
      env: {},
      mounts,
      seoPolicy,
    }) ?? response
  );
}

describe('contacts apex mount admission', () => {
  it('composes the tuturuuu.com mount from the app-owned config', () => {
    expect(mounts).toMatchObject({
      app: 'contacts',
      rootHosts: ['contacts.tuturuuu.com'],
      mountHosts: ['tuturuuu.com'],
      basePath: '/contacts',
      unknownHost: 'reject',
    });
  });

  it('admits the canonical mount root without a trailing slash', () => {
    expect(
      resolveAppBase(new URL('https://tuturuuu.com/contacts'), mounts)
    ).toEqual({ mode: 'mounted', basePath: '/contacts' });
  });

  it('admits the mount host case-insensitively', () => {
    expect(
      resolveAppBase(new URL('https://TUTURUUU.COM/contacts'), mounts)
    ).toEqual({ mode: 'mounted', basePath: '/contacts' });
  });

  it.each([
    '/contacts/',
    '/contacts/dashboard',
    '/contacts/en/users',
    '/contacts/_serverFn',
    '/contacts/assets/chunk.js',
  ])('serves mounted path %s', (path) => {
    expect(
      resolveAppBase(new URL(`https://tuturuuu.com${path}`), mounts)
    ).toEqual({ mode: 'mounted', basePath: '/contacts' });
  });

  it.each(['/', '/tasks', '/contact', '/contactsx'])(
    'keeps tuturuuu.com path %s outside the app',
    (path) => {
      expect(
        resolveAppBase(new URL(`https://tuturuuu.com${path}`), mounts)
      ).toBeNull();
    }
  );

  it('serves the subdomain root host at /', () => {
    expect(
      resolveAppBase(new URL(`https://${canonical}/dashboard`), mounts)
    ).toEqual({ mode: 'root', basePath: '' });
  });

  it.each([
    'unknown.invalid',
    'contacts.tuturuuu.com.attacker.invalid',
    'tuturuuu-contacts-vite-staging.example.workers.dev',
    'tuturuuu.com:8443',
  ])('rejects unlisted host %s', (host) => {
    expect(
      resolveAppBase(new URL(`https://${host}/contacts`), mounts)
    ).toBeNull();
  });
});

describe('contacts mounted response policy', () => {
  it.each(['/contacts/login', '/contacts/en/login'])(
    'serves %s with denied framing, private robots and no-store caching',
    async (path) => {
      const response = await apply(path);
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
      expect(response.headers.get('X-Robots-Tag')).toBe(PRIVATE_ROBOTS_HEADER);
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      expect(
        response.headers
          .get('Vary')
          ?.split(',')
          .map((value) => value.trim().toLowerCase())
      ).toEqual(['origin', 'cookie']);
      expect(response.headers.get('Set-Cookie')).toBe('fixture=value; HttpOnly');
      expect(await response.text()).toBe('fixture');
    }
  );

  it.each(['GET', 'HEAD'])(
    'keeps own asset caching for %s under the mount',
    async (method) => {
      const response = await apply('/contacts/assets/chunk.js', method);
      expect(response.headers.get('Cache-Control')).toBe('private, max-age=600');
      expect(response.headers.get('Vary')).toBe('Origin');
    }
  );

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'does not grant asset caching to %s under the mount',
    async (method) => {
      const response = await apply('/contacts/assets/chunk.js', method);
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      expect(response.headers.get('Vary')).toContain('Cookie');
    }
  );
});
