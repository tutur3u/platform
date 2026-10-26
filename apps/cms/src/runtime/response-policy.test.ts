// @vitest-environment node
import { describe, expect, it } from 'vitest';
import appConfig from '../../start-bridge.config';
import { publicAssets } from '../start-bridge/public-assets.bridge.gen';

async function decorate(
  path: string,
  options: {
    method?: string;
    status?: number;
    headers?: HeadersInit;
  } = {}
) {
  const wrap = appConfig.wrapResponse;
  if (!wrap) throw new Error('CMS response policy is required');
  return wrap(
    new Response('body', {
      status: options.status ?? 200,
      headers: options.headers,
    }),
    {
      request: new Request(`https://cms.tuturuuu.com${path}`, {
        method: options.method ?? 'GET',
      }),
      env: { ASSETS: { fetch: async () => new Response('asset') } },
    }
  );
}

describe('CMS response policy', () => {
  it('overrides upstream public caching, including CDN overrides', async () => {
    const response = await decorate('/api/v1/admin/external-projects', {
      headers: {
        'Cache-Control': 'public, max-age=600',
        'CDN-Cache-Control': 'public, max-age=600',
        'Cloudflare-CDN-Cache-Control': 'max-age=600',
        'Vercel-CDN-Cache-Control': 'max-age=600',
        Vary: 'Origin',
      },
    });
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('Vary')).toBe(
      'Origin, Cookie, Authorization, Accept-Language'
    );
    for (const name of [
      'CDN-Cache-Control',
      'Cloudflare-CDN-Cache-Control',
      'Vercel-CDN-Cache-Control',
    ]) {
      expect(response.headers.has(name)).toBe(false);
    }
  });
  it.each(['/assets/app.js', '/robots.txt'])(
    'only exempts static GET/HEAD at %s',
    async (path) => {
      for (const method of ['GET', 'HEAD']) {
        const response = await decorate(path, {
          method,
          headers: { 'Cache-Control': 'public, max-age=600' },
        });
        expect(response.headers.get('Cache-Control')).toBe(
          'public, max-age=600'
        );
      }
      expect(
        (await decorate(path, { method: 'POST' })).headers.get('Cache-Control')
      ).toBe('private, no-store');
    }
  );
  it('covers the complete current public-asset exemption', () => {
    expect([...publicAssets]).toEqual(['/robots.txt']);
  });
  it.each(['/assets/missing.js', '/robots.txt'])(
    'does not cache HTML, errors or cookie writes at %s',
    async (path) => {
      for (const options of [
        { headers: new Headers({ 'Content-Type': 'text/html' }) },
        { status: 404 },
        { headers: new Headers({ 'Set-Cookie': 'fixture=value; HttpOnly' }) },
      ]) {
        expect(
          (await decorate(path, options)).headers.get('Cache-Control')
        ).toBe('private, no-store');
      }
    }
  );
  it('rewrites ancestors and preserves all other CSP restrictions', async () => {
    const response = await decorate('/', {
      headers: {
        'Content-Security-Policy':
          "script-src 'nonce-fixture'; frame-ancestors https://other.test; object-src 'none'",
      },
    });
    expect(response.headers.get('Content-Security-Policy')).toBe(
      "script-src 'nonce-fixture'; object-src 'none'; frame-ancestors 'none'"
    );
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(appConfig.csp).toBeUndefined();
  });
  it('rewrites each CSP policy without dropping its sandbox', async () => {
    const response = await decorate('/', {
      headers: {
        'Content-Security-Policy':
          "default-src 'self'; FRAME-ANCESTORS *, sandbox allow-scripts; frame-ancestors https://other.test",
      },
    });
    expect(response.headers.get('Content-Security-Policy')).toBe(
      "default-src 'self'; frame-ancestors 'none', sandbox allow-scripts; frame-ancestors 'none'"
    );
  });
  it.each([
    '/api/v1/workspaces/ws/external-projects/assets/asset/webgl',
    '/api/v1/workspaces/ws/external-projects/assets/asset/webgl/index.html',
  ])('preserves the uploaded-game sandbox verbatim at %s', async (path) => {
    const sandbox =
      "sandbox allow-scripts allow-pointer-lock; default-src 'self' data: blob:; script-src 'unsafe-inline' 'unsafe-eval'";
    const response = await decorate(path, {
      headers: {
        'Content-Security-Policy': sandbox,
        'X-Frame-Options': 'DENY',
      },
    });
    expect(response.headers.get('Content-Security-Policy')).toBe(sandbox);
    expect(response.headers.has('X-Frame-Options')).toBe(false);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
  it.each([
    '/api/v1/workspaces/ws/external-projects/assets/asset/webgl-extra',
    '/api/v1/workspaces/ws/external-projects/assets/asset',
    '/vi/api/v1/workspaces/ws/external-projects/assets/asset/webgl',
  ])('denies framing on neighbouring path %s', async (path) => {
    const response = await decorate(path);
    expect(response.headers.get('Content-Security-Policy')).toBe(
      "frame-ancestors 'none'"
    );
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  });
  it.each([
    { path: '/assets/app.js', status: 200 },
    { path: '/login', status: 307 },
    { path: '/missing', status: 404 },
  ])(
    'always blocks indexing and preserves response data at $path',
    async ({ path, status }) => {
      const response = await decorate(path, { status });
      expect(response.status).toBe(status);
      expect(await response.text()).toBe('body');
      expect(response.headers.get('X-Robots-Tag')).toBe(
        'noindex, nofollow, nosnippet'
      );
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('Referrer-Policy')).toBe(
        'strict-origin-when-cross-origin'
      );
    }
  );
});
