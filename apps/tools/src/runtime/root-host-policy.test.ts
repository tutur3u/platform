import { createBridgeHandler } from '@tuturuuu/start-bridge/start/handler';
import { NextResponse } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import appConfig from '../../start-bridge.config';

afterEach(() => {
  vi.unstubAllGlobals();
});

function fixture() {
  const start = vi.fn(async () => new Response('Tools page'));
  const proxy = vi.fn(async () => NextResponse.next());
  const assets = vi.fn(() => undefined);
  const outbound = vi.fn(async () => {
    throw new Error('Unexpected egress');
  });
  vi.stubGlobal('fetch', outbound);
  const ctx = { waitUntil: vi.fn() };
  const handle = createBridgeHandler<Record<string, never>, typeof ctx>({
    mounts: {
      app: 'tools',
      rootHosts: ['tools.tuturuuu.com'],
      mountHosts: ['tuturuuu.com'],
      basePath: '/tools',
      ...appConfig.mounts,
    },
    start: { fetch: start },
    proxy,
    endpoints: [],
    assets,
    centralApiOrigin: () => 'https://central.invalid',
  });
  return { handle, ctx, start, outbound };
}

describe('Tools host policy', () => {
  it.each([
    'https://unknown.example.test/',
    'https://tuturuuu-tools-vite-staging.tuturuuu-e89.workers.dev/',
    'https://tools.tutur3u.com.evil.test/',
    'https://tools.staging.tutur3u.com/',
    'https://tuturuuu.com/other',
  ])('rejects %s before app dispatch or egress', async (url) => {
    const { handle, ctx, start, outbound } = fixture();
    const response = await handle(new Request(url), {}, ctx);
    expect(response.status).toBe(404);
    expect(start).not.toHaveBeenCalled();
    expect(outbound).not.toHaveBeenCalled();
  });

  it.each([
    'https://tools.tuturuuu.com/qr',
    'https://tools.tutur3u.com/qr',
    'https://tuturuuu.com/tools/qr',
  ])('admits %s', async (url) => {
    const { handle, ctx, start, outbound } = fixture();
    const response = await handle(new Request(url), {}, ctx);
    expect(response.status).toBe(200);
    expect(start).toHaveBeenCalledOnce();
    expect(outbound).not.toHaveBeenCalled();
  });
});
