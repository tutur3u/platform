// Codex review RED tests for #6742 (mount trust, emitted asset transform,
// loop guard, registry directory and route-shape checks), kept as regressions.

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { describe, expect, it, vi } from 'vitest';
import { runRegistries } from './codegen/cli';
import { planRegistries } from './codegen/registry';
import { runtimeAppBase } from './core/app-url';
import { withBridgeRequest } from './server/request-context';
import { createBridgeHandler } from './start/handler';
import { startBridgePreset } from './vite/preset';

const sdk = vi.hoisted(() => ({ options: undefined as any }));
vi.mock('@tanstack/react-start/server', () => ({
  defaultStreamHandler: () => {},
  createStartHandler: (options: unknown) => {
    sdk.options = options;
    return async () => new Response('sdk');
  },
}));

import { createBridgeStartHandler } from './start/server-entry';

const mounts = {
  app: 'meet',
  rootHosts: ['meet.tuturuuu.com'],
  mountHosts: ['tuturuuu.com'],
  basePath: '/meet',
};
function handler(unknownHost?: 'root' | 'reject') {
  return createBridgeHandler({
    mounts: { ...mounts, unknownHost },
    start: {
      fetch: async (request: Request) => {
        await Promise.resolve();
        return Response.json({
          base: runtimeAppBase(),
          marker: request.headers.get('x-tuturuuu-app-base'),
        });
      },
    },
    proxy: async () => NextResponse.next(),
    assets: () => undefined,
    centralApiOrigin: () => 'https://tuturuuu.com',
  });
}
const ctx = { waitUntil() {} };

describe('bd3 mount trust review', () => {
  it('uses URL authority, strips spoofed mode headers, and isolates interleaved bases', async () => {
    const handle = handler('reject');
    const headers = {
      host: 'tuturuuu.com',
      'x-forwarded-host': 'tuturuuu.com',
      'x-tuturuuu-app-base': '/mail',
    };
    const [root, mounted] = await Promise.all([
      handle(
        new Request('https://meet.tuturuuu.com/r/a', { headers }),
        {},
        ctx
      ),
      handle(
        new Request('https://tuturuuu.com/meet/r/a', {
          headers: {
            ...headers,
            host: 'evil.invalid',
            'x-forwarded-host': 'meet.tuturuuu.com',
          },
        }),
        {},
        ctx
      ),
    ]);
    expect(await root.json()).toEqual({ base: '', marker: null });
    expect(await mounted.json()).toEqual({ base: '/meet', marker: '/meet' });
    expect(
      (await handle(new Request('https://tuturuuu.com/meeting'), {}, ctx))
        .status
    ).toBe(404);
    expect(
      (
        await handle(
          new Request('https://unknown.invalid/meet/r/a', { headers }),
          {},
          ctx
        )
      ).status
    ).toBe(404);
  });

  it('documents the default root fallback for unknown hosts', async () => {
    const response = await handler()(
      new Request('https://unknown.invalid/meet/r/a', {
        headers: { 'x-tuturuuu-app-base': '/meet' },
      }),
      {},
      ctx
    );
    expect(await response.json()).toEqual({ base: '', marker: null });
  });
});

describe('bd3 emitted asset transform review', () => {
  it('prefixes ordinary root-manifest URLs per request and preserves external URLs', () => {
    createBridgeStartHandler();
    const transform = withBridgeRequest(
      { request: new Request('https://tuturuuu.com/meet'), appBase: '/meet' },
      () =>
        sdk.options.transformAssets.createTransform({
          warmup: false,
          request: new Request('https://tuturuuu.com/meet'),
        })
    );
    expect(transform({ url: '/assets/app.js', kind: 'script' })).toBe(
      '/meet/assets/app.js'
    );
    expect(
      transform({ url: 'https://cdn.invalid/app.js', kind: 'script' })
    ).toBe('https://cdn.invalid/app.js');
    expect(transform({ url: '//cdn.invalid/app.js', kind: 'script' })).toBe(
      '//cdn.invalid/app.js'
    );
  });

  it('does not duplicate a valid build-time base in mounted SSR asset URLs', () => {
    createBridgeStartHandler();
    const preset = startBridgePreset(
      { app: 'meet', appRoot: 'file:///repo/apps/meet/vite.config.ts' },
      { TUTURUUU_BASE_PATH: '/meet' }
    );
    const transform = withBridgeRequest(
      { request: new Request('https://tuturuuu.com/meet'), appBase: '/meet' },
      () =>
        sdk.options.transformAssets.createTransform({
          warmup: false,
          request: new Request('https://tuturuuu.com/meet'),
        })
    );
    const emitted = preset.base + 'assets/app.js';
    expect(transform({ url: emitted, kind: 'script' })).toBe(
      '/meet/assets/app.js'
    );
  });
});

describe('remaining bd3 contract regressions', () => {
  it('forwards mounted APIs to central Web on the same origin', async () => {
    const stub = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('central'));
    try {
      const response = await handler()(
        new Request('https://tuturuuu.com/meet/api/v1/workspaces'),
        {},
        ctx
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('central');
    } finally {
      stub.mockRestore();
    }
  });

  it('fails registry checks for an absent source directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'review-bd3-registry-'));
    mkdirSync(join(root, 'src/runtime'), { recursive: true });
    mkdirSync(join(root, 'src/app/api/private'), { recursive: true });
    writeFileSync(join(root, 'src/app/api/private/route.ts'), 'export {};');
    writeFileSync(
      join(root, 'start-bridge.routes.json'),
      JSON.stringify({
        appDir: 'src/appp',
        api: { out: 'src/runtime/api.bridge.gen.ts' },
      })
    );
    runRegistries(root, 'generate');
    expect(runRegistries(root, 'check').length).toBeGreaterThan(0);
  });

  it('rejects ambiguous dynamic route shapes', () => {
    const plan = planRegistries(
      { api: { out: 'gen.ts' } },
      ['api/[id]/route.ts', 'api/[slug]/route.ts'],
      () => true
    );
    expect(plan.errors.length).toBeGreaterThan(0);
  });
});
