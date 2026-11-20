import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { describe, expect, it, vi } from 'vitest';
import type { AssetsBinding } from '../core/assets';
import { createBridgeHandler } from './handler';

type Env = { ASSETS: AssetsBinding };
const ctx = { waitUntil: vi.fn() };
const env: Env = { ASSETS: { fetch: async () => new Response('asset') } };

/** Every gated request is refused, so a 401 proves the gate ran. */
const proxy = vi.fn(async () =>
  NextResponse.json({ error: 'proxy' }, { status: 401 })
);
const functionProxy = vi.fn(async () =>
  NextResponse.json({ error: 'function' }, { status: 403 })
);
const start = vi.fn(async () => new Response('start'));

const handle = createBridgeHandler<Env, typeof ctx>({
  mounts: {
    app: 'infrastructure',
    rootHosts: ['infrastructure.tuturuuu.com'],
    mountHosts: ['tuturuuu.com'],
    basePath: '/admin',
  },
  start: { fetch: start },
  proxy,
  // Next's usual matcher: it skips every path with a dot.
  matches: (pathname) => !/^\/(?:_next|.*\..*)/u.test(pathname),
  serverFnBase: '/_serverFn',
  functionBase: '/_serverFn',
  functionProxy,
  publicAssets: new Set(['/robots.txt']),
  assets: (bindings) => bindings.ASSETS,
  centralApiOrigin: () => 'https://central.example',
});

const get = (url: string) => handle(new Request(url), env, ctx);

describe('proxy gate independent of the app matcher', () => {
  it.each([
    'https://infrastructure.tuturuuu.com/_serverFn/id/x.y',
    'https://tuturuuu.com/admin/_serverFn/id/x.y',
  ])('runs the function proxy for a dotted server function %s', async (url) => {
    vi.clearAllMocks();
    const response = await get(url);
    expect(response.status).toBe(403);
    expect(functionProxy).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
  });

  it('runs the app proxy for a dotted page path on the mount', async () => {
    vi.clearAllMocks();
    const response = await get('https://tuturuuu.com/admin/vi/root/jobs/a.b');
    expect(response.status).toBe(401);
    expect(proxy).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
  });

  it('serves a mounted public asset without the proxy', async () => {
    vi.clearAllMocks();
    const response = await get('https://tuturuuu.com/admin/robots.txt');
    expect(await response.text()).toBe('asset');
    expect(proxy).not.toHaveBeenCalled();
  });

  it('keeps the app matcher for dotted pages on the root host', async () => {
    vi.clearAllMocks();
    const response = await get(
      'https://infrastructure.tuturuuu.com/vi/root/jobs/a.b'
    );
    expect(await response.text()).toBe('start');
    expect(proxy).not.toHaveBeenCalled();
  });
});
