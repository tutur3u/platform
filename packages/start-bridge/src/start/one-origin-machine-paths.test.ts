import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { describe, expect, it, vi } from 'vitest';
import type { AssetsBinding } from '../core/assets';
import { createBridgeHandler } from './handler';

type Env = { ASSETS: AssetsBinding; TTR_ONE_ORIGIN_MEET?: string };
const ctx = { waitUntil: vi.fn() };
const env: Env = {
  ASSETS: { fetch: async () => new Response('asset') },
  TTR_ONE_ORIGIN_MEET: 'on',
};

function handler(machinePathPrefixes?: readonly string[]) {
  return createBridgeHandler<Env, typeof ctx>({
    mounts: {
      app: 'meet',
      rootHosts: ['meet.tuturuuu.com'],
      mountHosts: ['tuturuuu.com'],
      basePath: '/meet',
      machinePathPrefixes,
    },
    start: { fetch: async () => new Response('page') },
    proxy: async () => NextResponse.next(),
    assets: (current) => current.ASSETS,
    centralApiOrigin: () => 'https://central.example',
    publicAssets: new Set(['/robots.txt']),
  });
}

const visit = (handle: ReturnType<typeof handler>, path: string) =>
  handle(
    new Request(`https://meet.tuturuuu.com${path}`, {
      headers: { 'sec-fetch-mode': 'navigate', accept: 'text/html' },
    }),
    env,
    ctx
  );

describe('one-origin `on` redirect and app-declared machine paths', () => {
  it('keeps declared machine prefixes and public assets on the subdomain', async () => {
    const declared = handler(['/verify-token']);
    for (const path of [
      '/verify-token?token=t',
      '/verify-token/extra',
      '/robots.txt',
    ])
      expect((await visit(declared, path)).status).not.toBe(307);
    expect((await visit(declared, '/r/abc')).status).toBe(307);
  });

  it('moves an undeclared handoff return to the apex', async () => {
    const response = await visit(handler(), '/verify-token?token=t');
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://tuturuuu.com/meet/verify-token?token=t'
    );
  });
});
