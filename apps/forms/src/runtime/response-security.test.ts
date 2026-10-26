// @vitest-environment node
import { defaultContentSecurityPolicy } from '@tuturuuu/start-bridge/csp';
import { createBridgeHandler } from '@tuturuuu/start-bridge/start/handler';
import { NextResponse } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import appConfig from '../../start-bridge.config';

const env = {
  ASSETS: { fetch: async () => new Response('asset') },
  TUTURUUU_NOINDEX: '1',
};

async function decorate({
  path,
  headers = {},
  status = 200,
  method = 'GET',
  noindex = '1',
}: {
  path: string;
  headers?: HeadersInit;
  status?: number;
  method?: string;
  noindex?: string;
}) {
  const wrap = appConfig.wrapResponse;
  if (!wrap) throw new Error('Forms must decorate Worker responses');
  return wrap(new Response('payload', { status, headers }), {
    request: new Request(`https://forms.tuturuuu.com${path}`, { method }),
    env: { ...env, TUTURUUU_NOINDEX: noindex },
  });
}

describe('Forms root-only admission', () => {
  it.each([
    'https://tuturuuu.com/forms',
    'https://tuturuuu.com/forms/api/v1/shared/forms/example',
    'https://tuturuuu.com/forms/_serverFn/example',
    'https://tuturuuu.com/forms/assets/example.js',
    'https://unknown.example.test/',
    'https://tuturuuu-forms-vite-staging.tuturuuu-e89.workers.dev/',
  ])('rejects %s before app dispatch or egress', async (url) => {
    const start = vi.fn(async () => new Response('Forms root'));
    const proxy = vi.fn(async () => NextResponse.next());
    const assets = vi.fn(() => undefined);
    const forwardApi = vi.fn(async () => new Response('central'));
    const ctx = { waitUntil: vi.fn() };
    const handle = createBridgeHandler<typeof env, typeof ctx>({
      mounts: { app: 'forms', rootHosts: [], ...appConfig.mounts },
      start: { fetch: start },
      proxy,
      assets,
      forwardApi,
      centralApiOrigin: () => 'https://central.invalid',
    });
    const response = await handle(
      new Request(url, {
        headers: { 'x-forwarded-host': 'forms.tuturuuu.com' },
      }),
      env,
      ctx
    );
    expect(response.status).toBe(404);
    expect(response.headers.has('Set-Cookie')).toBe(false);
    for (const dispatch of [start, proxy, assets, forwardApi]) {
      expect(dispatch).not.toHaveBeenCalled();
    }
  });

  it.each(['forms.tuturuuu.com', 'forms-staging.tuturuuu.com'])(
    'admits %s at its root',
    async (host) => {
      const ctx = { waitUntil: vi.fn() };
      const handle = createBridgeHandler<typeof env, typeof ctx>({
        mounts: { app: 'forms', rootHosts: [], ...appConfig.mounts },
        start: { fetch: async () => new Response('Forms root') },
        proxy: async () => NextResponse.next(),
        assets: () => undefined,
        centralApiOrigin: () => 'https://central.invalid',
      });
      const response = await handle(new Request(`https://${host}/`), env, ctx);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('Forms root');
    }
  );
});

describe('Forms response security', () => {
  it.each([
    '/',
    '/vi',
    '/f/public',
    '/api/v1/shared/forms/public',
    '/_serverFn/id',
  ])('forces private no-store on %s, including CDN overrides', async (path) => {
    const response = await decorate({
      path,
      headers: {
        'Cache-Control': 'public, max-age=3600',
        'CDN-Cache-Control': 'public, max-age=3600',
        'Cloudflare-CDN-Cache-Control': 'max-age=3600',
        'Vercel-CDN-Cache-Control': 'max-age=3600',
        Vary: 'Origin',
      },
    });
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('Vary')).toBe(
      'origin, cookie, authorization, accept-language'
    );
    for (const name of [
      'CDN-Cache-Control',
      'Cloudflare-CDN-Cache-Control',
      'Vercel-CDN-Cache-Control',
    ]) {
      expect(response.headers.has(name)).toBe(false);
    }
  });

  it.each(['/assets/app.js', '/embed.js', '/robots.txt', '/sitemap.xml'])(
    'preserves cache policy for the public static file %s',
    async (path) => {
      const response = await decorate({
        path,
        headers: {
          'Content-Type': 'application/javascript',
          'Cache-Control': 'public, max-age=3600',
        },
      });
      expect(response.headers.get('Cache-Control')).toBe(
        'public, max-age=3600'
      );
    }
  );

  it.each([
    {
      path: '/assets/missing.js',
      headers: new Headers({ 'Content-Type': 'text/html' }),
    },
    {
      path: '/embed.js',
      headers: new Headers({ 'Set-Cookie': 'fixture=value; HttpOnly' }),
    },
    { path: '/assets/private.js', method: 'POST' },
    { path: '/assets/missing.js', status: 404 },
  ])('does not cache a non-static response: %j', async (input) => {
    const response = await decorate(input);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it.each(['/embed/public', '/embed/public/preview'])(
    'keeps %s framable without weakening script nonces',
    async (path) => {
      const response = await decorate({
        path,
        headers: {
          'Content-Security-Policy': defaultContentSecurityPolicy('fixture'),
          'X-Frame-Options': 'DENY',
        },
      });
      expect(response.headers.has('X-Frame-Options')).toBe(false);
      expect(response.headers.get('Content-Security-Policy')).toBe(
        "script-src 'nonce-fixture' 'strict-dynamic'; object-src 'none'; base-uri 'self'; frame-ancestors *"
      );
      expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    }
  );

  it.each([
    '/f/public',
    '/personal/forms',
    '/embedded/public',
    '/embed',
    '/vi/embed/public',
    '/en/embed/public',
  ])('denies framing of the ordinary page %s', async (path) => {
    const csp = defaultContentSecurityPolicy('fixture');
    const response = await decorate({
      path,
      headers: { 'Content-Security-Policy': csp },
      noindex: '0',
    });
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(response.headers.get('Content-Security-Policy')).toBe(csp);
    expect(response.headers.has('X-Robots-Tag')).toBe(false);
  });

  it('preserves the response body, status and cookies and adds baseline headers', async () => {
    const response = await decorate({
      path: '/api/auth/callback',
      status: 401,
      headers: { 'Set-Cookie': 'fixture=value; HttpOnly; Secure' },
    });
    expect(response.status).toBe(401);
    expect(await response.text()).toBe('payload');
    expect(response.headers.get('Set-Cookie')).toBe(
      'fixture=value; HttpOnly; Secure'
    );
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Referrer-Policy')).toBe(
      'strict-origin-when-cross-origin'
    );
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });
});
