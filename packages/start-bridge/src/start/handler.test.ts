import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { describe, expect, it, vi } from 'vitest';
import { createBasePath } from '../core/base-path';
import { cookies } from '../core/request-context';
import { createBridgeHandler } from './handler';

const ctx = { waitUntil: vi.fn() };
type Env = { ASSETS: { fetch(request: Request): Promise<Response> } };

function setup(basePath?: string) {
  const assets = vi.fn(async (request: Request) => new Response(request.url));
  const start = vi.fn(async (request: Request) => {
    (await cookies()).set('tuturuuu_app_session', 'fresh', { path: '/' });
    return new Response(`start ${new URL(request.url).pathname}`);
  });
  const fetcher = vi.fn();
  const handle = createBridgeHandler<Env, typeof ctx>({
    basePath: basePath ? createBasePath({ app: 'meet', basePath }) : undefined,
    start: { fetch: start },
    proxy: async (request) => {
      if (request.nextUrl.pathname === '/private')
        return NextResponse.redirect(new URL('/login', 'https://x.test'));
      if (request.nextUrl.pathname === '/relative')
        return new NextResponse(null, {
          status: 307,
          headers: { location: '/login' },
        });
      return NextResponse.next();
    },
    endpoints: [
      {
        pattern: '/api/own',
        module: {
          GET: async (request: Request) =>
            new Response(new URL(request.url).pathname),
        },
      },
    ],
    publicAssets: new Set(['/robots.txt']),
    assets: (env) => env.ASSETS,
    centralApiOrigin: () => 'https://central.example',
    forwardApi: undefined,
  });
  const env: Env = { ASSETS: { fetch: assets } };
  return { handle, env, assets, start, fetcher };
}

describe('bridge handler at the root', () => {
  it('serves assets, endpoints and Start without rewriting', async () => {
    const { handle, env, assets } = setup();
    const asset = await handle(
      new Request('https://x.test/assets/a.js'),
      env,
      ctx
    );
    expect(await asset.text()).toBe('https://x.test/assets/a.js');
    expect(assets).toHaveBeenCalledOnce();
    const own = await handle(new Request('https://x.test/api/own'), env, ctx);
    expect(await own.text()).toBe('/api/own');
    const page = await handle(new Request('https://x.test/r/abc'), env, ctx);
    expect(await page.text()).toBe('start /r/abc');
    expect(page.headers.getSetCookie()).toEqual([
      'tuturuuu_app_session=fresh; Path=/',
    ]);
    const relative = await handle(
      new Request('https://x.test/relative'),
      env,
      ctx
    );
    expect(relative.headers.get('location')).toBe('/login');
  });
});

describe('bridge handler under /meet', () => {
  it('refuses paths outside the base', async () => {
    const { handle, env } = setup('/meet');
    const response = await handle(
      new Request('https://tuturuuu.com/calendar'),
      env,
      ctx
    );
    expect(response.status).toBe(404);
  });

  it('strips the base for assets, keeps it for Start, dispatches app-relative endpoints', async () => {
    const { handle, env } = setup('/meet');
    const asset = await handle(
      new Request('https://tuturuuu.com/meet/robots.txt'),
      env,
      ctx
    );
    expect(await asset.text()).toBe('https://tuturuuu.com/robots.txt');
    const own = await handle(
      new Request('https://tuturuuu.com/meet/api/own'),
      env,
      ctx
    );
    expect(await own.text()).toBe('/meet/api/own');
    const page = await handle(
      new Request('https://tuturuuu.com/meet/r/abc', {
        headers: { cookie: 'tuturuuu_app_session__meet=old' },
      }),
      env,
      ctx
    );
    expect(await page.text()).toBe('start /meet/r/abc');
    expect(page.headers.getSetCookie()).toEqual([
      'tuturuuu_app_session__meet=fresh; Path=/meet',
    ]);
  });

  it('prefixes path-relative middleware redirects and leaves absolute ones', async () => {
    const { handle, env } = setup('/meet');
    const relative = await handle(
      new Request('https://tuturuuu.com/meet/relative'),
      env,
      ctx
    );
    expect(relative.headers.get('location')).toBe('/meet/login');
    const absolute = await handle(
      new Request('https://tuturuuu.com/meet/private'),
      env,
      ctx
    );
    expect(absolute.headers.get('location')).toBe('https://x.test/login');
  });

  it('forwards unowned API calls to the central API without the base', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        async (input) => new Response((input as Request).url)
      );
    const { handle, env } = setup('/meet');
    const response = await handle(
      new Request('https://tuturuuu.com/meet/api/v1/x?y=1'),
      env,
      ctx
    );
    expect(await response.text()).toBe('https://central.example/api/v1/x?y=1');
    fetchSpy.mockRestore();
  });
});
