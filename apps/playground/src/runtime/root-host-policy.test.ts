import { createBridgeHandler } from '@tuturuuu/start-bridge/start/handler';
import { NextResponse } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import appConfig from '../../start-bridge.config';

afterEach(() => {
  vi.unstubAllGlobals();
});

function fixture() {
  const start = vi.fn(async () => new Response('Playground page'));
  const proxy = vi.fn(async () => NextResponse.next());
  const assets = vi.fn(() => undefined);
  const outbound = vi.fn(async () => {
    throw new Error('Unexpected egress');
  });
  vi.stubGlobal('fetch', outbound);
  const ctx = { waitUntil: vi.fn() };
  const handle = createBridgeHandler<Record<string, never>, typeof ctx>({
    mounts: {
      app: 'playground',
      rootHosts: ['playground.tuturuuu.com'],
      mountHosts: ['tuturuuu.com'],
      basePath: '/playground',
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

describe('Playground host policy', () => {
  it('serves exactly the production and staging root hosts', () => {
    expect(appConfig.mounts?.rootHosts).toEqual([
      'playground.tuturuuu.com',
      'playground.tutur3u.com',
    ]);
    expect(appConfig.mounts?.unknownHost).toBe('reject');
  });

  it.each([
    'https://unknown.example.test/',
    'https://playground.example.workers.dev/',
    'https://playground.tutur3u.com.evil.test/',
    'https://playground.staging.tutur3u.com/',
    'https://tuturuuu.com/other',
  ])('rejects %s before app dispatch or egress', async (url) => {
    const { handle, ctx, start, outbound } = fixture();
    const response = await handle(new Request(url), {}, ctx);
    expect(response.status).toBe(404);
    expect(start).not.toHaveBeenCalled();
    expect(outbound).not.toHaveBeenCalled();
  });

  it.each([
    'https://playground.tuturuuu.com/',
    'https://playground.tutur3u.com/',
    'https://tuturuuu.com/playground',
  ])('admits %s', async (url) => {
    const { handle, ctx, start, outbound } = fixture();
    const response = await handle(new Request(url), {}, ctx);
    expect(response.status).toBe(200);
    expect(start).toHaveBeenCalledOnce();
    expect(outbound).not.toHaveBeenCalled();
  });
});
