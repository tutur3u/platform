// @vitest-environment node
import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  loadModule: vi.fn().mockResolvedValue({ endpoints: [] }),
  start: vi.fn(
    async (request: Request) =>
      new Response(`start:${new URL(request.url).pathname}`)
  ),
  proxy: vi.fn(),
}));
vi.stubGlobal('__driveTestRsc', { loadModule: runtime.loadModule });
vi.mock('@tuturuuu/start-bridge/start/server-entry', () => ({
  createBridgeStartHandler: () => ({ fetch: runtime.start }),
}));
vi.mock('../proxy', () => ({
  proxy: runtime.proxy,
  config: { matcher: ['/(.*)'] },
}));
vi.mock('@tuturuuu/start-bridge/function-proxy', () => ({
  createFunctionProxy: () => runtime.proxy,
}));

import worker from '../../cloudflare/worker';
import appConfig from '../../start-bridge.config';
import { stagingVars } from './staging-policy';

const ctx = { waitUntil: vi.fn() };
const env = {
  ...stagingVars,
  ASSETS: { fetch: vi.fn(async () => new Response('asset')) },
};

beforeEach(() => {
  vi.clearAllMocks();
  runtime.proxy.mockImplementation(() => NextResponse.next());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Drive Worker bridge boundary (Start/RSC adapters are fixtures)', () => {
  it.each([
    'https://tuturuuu.com/drive/personal',
    'https://drive.tuturuuu.com/personal',
    'https://drive.staging.tutur3u.com/personal',
    'https://web.tutur3u.com/drive/personal',
    'https://drive.tutur3u.com.evil.test/personal',
    'https://evil.drive.tutur3u.com/personal',
    'https://tuturuuu-drive-vite-staging.example.workers.dev/',
  ])('rejects unlisted host %s before any app code', async (url) => {
    const response = await worker.fetch(new Request(url), env, ctx);
    expect(response.status).toBe(404);
    expect(runtime.loadModule).not.toHaveBeenCalled();
    expect(runtime.proxy).not.toHaveBeenCalled();
    expect(runtime.start).not.toHaveBeenCalled();
    expect(response.headers.get('Strict-Transport-Security')).toBe(
      'max-age=63072000'
    );
  });

  it('rejects Domain cookies at the Worker exit even if the response wrapper regresses', async () => {
    vi.spyOn(appConfig, 'wrapResponse').mockReturnValueOnce(
      new Response('private', {
        headers: { 'Set-Cookie': 'session=x; Domain=.tutur3u.com; Secure' },
      })
    );
    vi.stubGlobal('__driveTestRsc', { loadModule: runtime.loadModule });
    const response = await worker.fetch(
      new Request('https://drive.tutur3u.com/personal'),
      env,
      ctx
    );
    expect(response.status).toBe(500);
    expect(response.headers.has('set-cookie')).toBe(false);
    expect(await response.text()).toBe('Staging cookie domain rejected');
  });

  it('rejects a production database before loading routes', async () => {
    const response = await worker.fetch(
      new Request('https://drive.tutur3u.com/personal'),
      { ...env, SUPABASE_SERVER_URL: 'https://production.supabase.co' },
      ctx
    );
    expect(response.status).toBe(503);
    expect(runtime.loadModule).not.toHaveBeenCalled();
    expect(runtime.start).not.toHaveBeenCalled();
  });

  it('passes English and Vietnamese root requests through the real shared bridge', async () => {
    vi.stubGlobal('__driveTestRsc', { loadModule: runtime.loadModule });
    for (const path of ['/personal', '/vi/personal']) {
      const response = await worker.fetch(
        new Request(`https://drive.tutur3u.com${path}`),
        env,
        ctx
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toBe(`start:${path}`);
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    }
    expect(runtime.proxy).toHaveBeenCalledTimes(2);
    expect(runtime.start).toHaveBeenCalledTimes(2);
  });

  it('forwards storage to the staging central API with identity and path intact', async () => {
    const fetch = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockResolvedValue(new Response('denied', { status: 403 }));
    vi.stubGlobal('fetch', fetch);
    const path =
      '/api/v1/workspaces/workspace-a/storage/list?path=chats%2Fprivate';
    const response = await worker.fetch(
      new Request(`https://drive.tutur3u.com${path}`, {
        headers: {
          cookie: 'tuturuuu_app_session=fixture',
          authorization: 'Bearer fixture',
        },
      }),
      env,
      ctx
    );
    expect(response.status).toBe(403);
    expect(runtime.start).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
    const forwarded = fetch.mock.calls[0]?.[0];
    expect(forwarded).toBeInstanceOf(Request);
    expect(forwarded?.url).toBe(`https://web.tutur3u.com${path}`);
    expect(forwarded?.headers.get('cookie')).toContain(
      'tuturuuu_app_session=fixture'
    );
    expect(forwarded?.headers.get('authorization')).toBe('Bearer fixture');
  });
});
