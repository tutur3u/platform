// @vitest-environment node
import {
  appPath,
  runtimeAppBase,
  withAppBase,
} from '@tuturuuu/start-bridge/app-url';
import { resolveAppBase } from '@tuturuuu/start-bridge/mounts';
import { createBridgeHandler } from '@tuturuuu/start-bridge/start/handler';
import { NextRequest, NextResponse } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import appConfig from '../../start-bridge.config';
import { mountedLogin } from './mounted-login';

vi.hoisted(() => {
  vi.stubEnv('VITE_DRIVE_NATIVE_PROFILE', 'production');
});
vi.mock('@tuturuuu/auth/proxy', async () => ({
  ...(await vi.importActual(
    '../../../../packages/auth/src/proxy/mounted-app-auth'
  )),
}));

const app = 'drive';
const base = '/drive';
const mounts = { app, rootHosts: [], ...appConfig.mounts };
const ctx = { waitUntil: vi.fn() };
afterEach(() => vi.unstubAllEnvs());

function fixture() {
  const seen: Request[] = [];
  const assets = {
    fetch: vi.fn(async (input: string) => {
      seen.push(new Request(input));
      return new Response('asset');
    }),
  };
  const proxy = vi.fn(async (request: NextRequest) => {
    seen.push(request);
    const login = await mountedLogin(request);
    if (login) return login;
    const response = NextResponse.next();
    response.cookies.set('NEXT_LOCALE', 'vi', {
      domain: '.tuturuuu.com',
      path: '/',
    });
    response.cookies.set('unowned', 'blocked', { path: '/' });
    return response;
  });
  const start = vi.fn(async () =>
    Response.json({
      base: runtimeAppBase(),
      locale: appPath('/assets/en.json'),
      chunk: appPath('/assets/chunk.js'),
    })
  );
  const forwardApi = vi.fn(async (request: NextRequest) => {
    seen.push(request);
    return new Response('api');
  });
  const handle = createBridgeHandler({
    mounts,
    start: { fetch: start },
    proxy,
    assets: () => assets,
    forwardApi,
    centralApiOrigin: () => 'https://tuturuuu.com',
  });
  return {
    seen,
    assets,
    proxy,
    start,
    forwardApi,
    call: (path: string, cookie?: string) =>
      handle(
        new Request(`https://tuturuuu.com${base}${path}`, {
          headers: cookie ? { cookie } : {},
        }),
        {},
        ctx
      ),
  };
}

describe('drive apex mount', () => {
  it('admits its apex prefix and subdomain, rejecting sibling paths and unknown hosts', () => {
    expect(
      resolveAppBase(new URL(`https://drive.tuturuuu.com/`), mounts)?.mode
    ).toBe('root');
    expect(
      resolveAppBase(new URL(`https://tuturuuu.com${base}`), mounts)
    ).toEqual({ mode: 'mounted', basePath: base });
    for (const path of ['/', '/other', `${base}-other`])
      expect(
        resolveAppBase(new URL(`https://tuturuuu.com${path}`), mounts)
      ).toBeNull();
    expect(
      resolveAppBase(new URL('https://unlisted.invalid/'), mounts)
    ).toBeNull();
  });

  it('isolates inbound cookies and confines middleware cookie writes to its base', async () => {
    const f = fixture();
    const response = await f.call(
      '/workspace',
      'NEXT_LOCALE=vi; sidebar-behavior=collapsed; other_app=private; tuturuuu_app_session=private'
    );
    expect(response.status).toBe(200);
    expect(f.seen[0]?.headers.get('cookie')).toBe(
      'NEXT_LOCALE=vi; sidebar-behavior=collapsed'
    );
    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toContain(`Path=${base}`);
    expect(cookies[0]).not.toMatch(/domain=/iu);
    expect(cookies[0]).toContain('Secure');
    expect(await response.json()).toEqual({
      base,
      locale: `${base}/assets/en.json`,
      chunk: `${base}/assets/chunk.js`,
    });
  });

  it.each(['/assets/chunk.js', '/assets/en.json'])(
    'dispatches mounted asset %s to the app binding',
    async (path) => {
      const f = fixture();
      const response = await f.call(path);
      expect(response.status).toBe(200);
      expect(new URL(f.seen[0]?.url ?? '').pathname).toBe(path);
      expect(f.proxy).not.toHaveBeenCalled();
    }
  );

  it('dispatches app-prefixed API requests and refuses mounted session writers', async () => {
    const f = fixture();
    expect((await f.call('/api/v1/fixture')).status).toBe(200);
    expect(f.forwardApi).toHaveBeenCalledOnce();
    const response = await f.call('/api/auth/refresh-app-session');
    expect(response.status).toBe(409);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it.each([
    '/',
    '/workspace?tab=one',
    '//evil.invalid/x',
    'https://evil.invalid/x',
  ])('sends login to Web with an in-mount return URL for %s', async (next) => {
    const f = fixture();
    const response = await f.call(`/login?next=${encodeURIComponent(next)}`);
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.origin + location.pathname).toBe(
      'https://tuturuuu.com/login'
    );
    const destination = new URL(location.searchParams.get('returnUrl') ?? '');
    expect(destination.origin).toBe('https://tuturuuu.com');
    expect(
      destination.pathname === base ||
        destination.pathname.startsWith(`${base}/`)
    ).toBe(true);
    expect(destination.pathname).toBe(`${base}/verify-token`);
    expect(destination.searchParams.get('nextUrl')).toBe(
      next === '/workspace?tab=one' ? next : '/'
    );
  });

  it('keeps root-mode URL and login handling intact', () => {
    expect(withAppBase('/assets/chunk.js', '')).toBe('/assets/chunk.js');
    expect(
      mountedLogin(new NextRequest('https://drive.tuturuuu.com/login'))
    ).toBeNull();
  });
});
