import { createBridgeHandler } from '@tuturuuu/start-bridge/start/handler';
import { NextResponse } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import appConfig from '../../start-bridge.config';

afterEach(() => {
  vi.unstubAllGlobals();
});

function fixture() {
  const start = vi.fn(async () => new Response('CMS root'));
  const proxy = vi.fn(async () => NextResponse.next());
  const assets = vi.fn(() => undefined);
  const outbound = vi.fn(async () => {
    throw new Error('Unexpected egress');
  });
  vi.stubGlobal('fetch', outbound);
  const ctx = { waitUntil: vi.fn() };
  const handle = createBridgeHandler<Record<string, never>, typeof ctx>({
    mounts: { app: 'cms', rootHosts: [], ...appConfig.mounts },
    start: { fetch: start },
    proxy,
    endpoints: [],
    assets,
    centralApiOrigin: () => 'https://central.invalid',
  });
  return { handle, ctx, start, proxy, assets, outbound };
}

describe('CMS root-only host policy', () => {
  it.each([
    'https://tuturuuu.com/cms',
    'https://tuturuuu.com/cms/api/v1/admin/external-projects',
    'https://tuturuuu.com/cms/_serverFn/fixture',
    'https://tuturuuu.com/cms/assets/fixture.js',
    'https://unknown.example.test/',
  ])('rejects %s before app dispatch or egress', async (url) => {
    const { handle, ctx, start, proxy, assets, outbound } = fixture();
    const response = await handle(
      new Request(url, {
        headers: { 'x-forwarded-host': 'cms.tuturuuu.com' },
      }),
      {},
      ctx
    );
    expect(response.status).toBe(404);
    expect(start).not.toHaveBeenCalled();
    expect(proxy).not.toHaveBeenCalled();
    expect(assets).not.toHaveBeenCalled();
    expect(outbound).not.toHaveBeenCalled();
  });

  it.each([
    'cms.tuturuuu.com',
    'cms-staging.tuturuuu.com',
    'tuturuuu-cms-vite-staging.tuturuuu-e89.workers.dev',
  ])('admits the explicit root host %s', async (host) => {
    const { handle, ctx, start, proxy, assets, outbound } = fixture();
    const response = await handle(
      new Request(`https://${host}/root-fixture`),
      {},
      ctx
    );
    expect(response.status).toBe(200);
    expect(start).toHaveBeenCalledOnce();
    expect(proxy).toHaveBeenCalledOnce();
    expect(assets).not.toHaveBeenCalled();
    expect(outbound).not.toHaveBeenCalled();
  });
});
