// @vitest-environment node
import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import productionVars from '../../cloudflare/production-profile.json';

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
// The deploy gate refuses every request outside a production build, which
// includes vitest (NODE_ENV=test). These tests cover what the Worker does
// once deployed; the gate itself is tested in required-bindings.test.ts.
vi.mock('../../cloudflare/required-bindings', () => ({
  missingRequiredBindings: () => false,
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

it('enforces the production fence and delegates storage on both admitted hosts', async () => {
  vi.stubEnv('VITE_DRIVE_NATIVE_PROFILE', 'production');
  vi.resetModules();
  vi.stubGlobal('__driveTestRsc', { loadModule: runtime.loadModule });
  const upstream = vi.fn(async (request: Request) => {
    if (request.method === 'POST') {
      return new Response(await request.text(), { status: 201 });
    }
    return new Response('partial', {
      status: 206,
      headers: { 'Content-Range': 'bytes 0-6/42' },
    });
  });
  vi.stubGlobal('fetch', upstream);
  try {
    const { default: productionWorker } =
      await import('../../cloudflare/worker');
    const productionEnv = {
      ...productionVars,
      NEXT_PUBLIC_SUPABASE_URL: 'https://drive-production-fixture.invalid',
      ASSETS: env.ASSETS,
    };
    const apex = 'https://tuturuuu.com';
    const bare = new Request(`${apex}/drive?x=1&x=2`);
    expect((await productionWorker.fetch(bare, env, ctx)).status).toBe(503);
    expect(runtime.loadModule).not.toHaveBeenCalled();
    for (const path of ['/', '/driveway', '/api/build-info']) {
      expect(
        (
          await productionWorker.fetch(
            new Request(apex + path),
            productionEnv,
            ctx
          )
        ).status
      ).toBe(404);
    }
    expect(
      await (await productionWorker.fetch(bare, productionEnv, ctx)).text()
    ).toBe('start:/drive');

    const storage = '/api/v1/workspaces/workspace-a/storage';
    for (const origin of ['https://drive.tuturuuu.com', apex]) {
      const base = origin === apex ? '/drive' : '';
      const downloadPath = `${storage}/download?x=1&x=2`;
      const download = await productionWorker.fetch(
        new Request(`${origin}${base}${downloadPath}`, {
          headers: { Range: 'bytes=0-6', Authorization: 'Bearer fixture' },
        }),
        productionEnv,
        ctx
      );
      expect(download.status).toBe(206);
      expect(download.headers.get('content-range')).toBe('bytes 0-6/42');
      expect(await download.text()).toBe('partial');
      expect(upstream.mock.lastCall?.[0]?.url).toBe(apex + downloadPath);
      expect(upstream.mock.lastCall?.[0]?.headers.get('range')).toBe(
        'bytes=0-6'
      );

      const uploadPath = `${storage}/upload-url?x=1&x=2`;
      const upload = await productionWorker.fetch(
        new Request(`${origin}${base}${uploadPath}`, {
          method: 'POST',
          headers: { Origin: origin, Authorization: 'Bearer fixture' },
          body: 'fixture upload request',
        }),
        productionEnv,
        ctx
      );
      expect(upload.status).toBe(201);
      expect(await upload.text()).toBe('fixture upload request');
      expect(upstream.mock.lastCall?.[0]?.url).toBe(apex + uploadPath);
    }
  } finally {
    vi.unstubAllEnvs();
  }
});
