import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssetsBinding } from '../core/assets';
import { createBridgeHandler } from './handler';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type Env = { ASSETS: AssetsBinding; WEB: string | undefined };
const ctx = { waitUntil: vi.fn() };
// Registered key that `@tuturuuu/internal-api` reads; keep both literals equal.
const POLICY_KEY = Symbol.for('tuturuuu.internalApi.webApiOriginPolicy');

function setup(webApiOrigin?: (env: Env) => string) {
  const page = vi.fn(async () => new Response('page'));
  const asset = vi.fn(async () => new Response('asset'));
  const fetcher = vi.fn<typeof fetch>(async () => new Response('upstream'));
  vi.stubGlobal('fetch', fetcher);
  const handle = createBridgeHandler<Env, typeof ctx>({
    mounts: {
      app: 'demo',
      rootHosts: ['demo.tuturuuu.com'],
      mountHosts: ['tuturuuu.com'],
      basePath: '/demo',
    },
    start: { fetch: page },
    proxy: async () => NextResponse.next(),
    assets: (env) => ({ fetch: env.ASSETS.fetch }),
    // The unvalidated binding read the generated Worker carries.
    centralApiOrigin: (env) => env.WEB ?? 'https://tuturuuu.com',
    webApiOrigin,
  });
  const env = (web?: string): Env => ({ ASSETS: { fetch: asset }, WEB: web });
  return { handle, page, asset, fetcher, env };
}

const trusted = (env: Env) => {
  if (env.WEB === undefined) return 'https://tuturuuu.com';
  if (env.WEB !== 'https://web.tutur3u.com')
    throw new Error('INTERNAL_WEB_API_ORIGIN is not trusted');
  return env.WEB;
};

const request = (path: string) =>
  new Request(`https://demo.tuturuuu.com${path}`);

describe('webApiOrigin', () => {
  it('forwards to the origin it returns, not the raw binding', async () => {
    const { handle, fetcher, env } = setup(trusted);

    await handle(request('/api/v1/x'), env(), ctx);
    await handle(request('/api/v1/x'), env('https://web.tutur3u.com'), ctx);

    expect(fetcher.mock.calls.map(([call]) => (call as Request).url)).toEqual([
      'https://tuturuuu.com/api/v1/x',
      'https://web.tutur3u.com/api/v1/x',
    ]);
  });

  it.each([
    ['an attacker origin', 'https://evil.example'],
    ['a blank value', ''],
    ['an http downgrade', 'http://web.tutur3u.com'],
  ])(
    'answers the generic 500 before any app code with %s',
    async (_label, web) => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { handle, page, asset, fetcher, env } = setup(trusted);

      for (const path of ['/api/v1/x', '/login', '/assets/app.js']) {
        const response = await handle(request(path), env(web), ctx);

        expect(response.status).toBe(500);
      }

      expect(fetcher).not.toHaveBeenCalled();
      expect(page).not.toHaveBeenCalled();
      expect(asset).not.toHaveBeenCalled();
      expect(logged).toHaveBeenCalled();
    }
  );

  it('keeps the raw binding behavior for an app without the hook', async () => {
    const { handle, fetcher, env } = setup();

    await handle(request('/api/v1/x'), env('https://central.example'), ctx);

    expect(fetcher.mock.calls.map(([call]) => (call as Request).url)).toEqual([
      'https://central.example/api/v1/x',
    ]);
  });

  it('publishes the resolver for server code that reads the binding', () => {
    setup(trusted);
    const published = (globalThis as Record<symbol, unknown>)[POLICY_KEY] as (
      vars: Record<string, string | undefined>
    ) => string;

    expect(published({})).toBe('https://tuturuuu.com');
    expect(() => published({ WEB: 'https://evil.example' })).toThrow(
      /not trusted/u
    );
  });
});
