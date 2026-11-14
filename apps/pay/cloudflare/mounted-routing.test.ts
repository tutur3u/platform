// @vitest-environment node
import { createHmac, randomBytes } from 'node:crypto';
import { Webhooks } from '@tuturuuu/payment/polar/next';
import { createBridgeHandler } from '@tuturuuu/start-bridge/start/handler';
import { NextResponse } from 'next/server';
import { afterEach, expect, it, vi } from 'vitest';
import {
  applyPayNativeProfileEnv,
  payNativeMounts,
  resolvePayNativeProfile,
} from './native-profile';

const ctx = { waitUntil: vi.fn() };
const env = resolvePayNativeProfile('production').vars;
const mounts = { app: 'pay', ...payNativeMounts('pay.tuturuuu.com') };

afterEach(() => vi.unstubAllEnvs());

it('isolates staging and rejects unknown production hosts and mount neighbours', async () => {
  expect(payNativeMounts('pay.tutur3u.com').mountHosts).toEqual([]);
  const start = vi.fn(async () => new Response('page'));
  const handle = createBridgeHandler({
    mounts,
    start: { fetch: start },
    proxy: async () => NextResponse.next(),
    assets: () => undefined,
    centralApiOrigin: () => 'https://central.invalid',
  });
  for (const url of [
    'https://unknown.invalid/pay',
    'https://tuturuuu.com/pay-extra',
    'https://tuturuuu.com/',
  ]) {
    expect((await handle(new Request(url), env, ctx)).status).toBe(404);
  }
  expect(start).not.toHaveBeenCalled();
});

it('301s legacy navigations to the bare mount and preserves query strings', async () => {
  const handle = createBridgeHandler({
    mounts,
    start: { fetch: async () => new Response('page') },
    proxy: async () => NextResponse.next(),
    assets: () => undefined,
    centralApiOrigin: () => 'https://central.invalid',
  });
  for (const [path, expected] of [
    ['/?a=1', '/pay?a=1'],
    ['/dashboard/?a=1', '/pay/dashboard?a=1'],
  ]) {
    const response = await handle(
      new Request(`https://pay.tuturuuu.com${path}`, {
        headers: { accept: 'text/html' },
      }),
      env,
      ctx
    );
    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe(
      `https://tuturuuu.com${expected}`
    );
  }
});

it('strips the mount once for static assets without routing outside /pay', async () => {
  const fetch = vi.fn(
    async () =>
      new Response('asset', { headers: { 'content-type': 'text/javascript' } })
  );
  const handle = createBridgeHandler({
    mounts,
    start: { fetch: async () => new Response('page') },
    proxy: async () => NextResponse.next(),
    assets: () => ({ fetch }),
    publicAssets: new Set(['/robots.txt']),
    centralApiOrigin: () => 'https://central.invalid',
  });
  for (const path of ['/assets/fixture.js', '/robots.txt']) {
    expect(
      (await handle(new Request(`https://tuturuuu.com/pay${path}`), env, ctx))
        .status
    ).toBe(200);
    expect(new URL(fetch.mock.calls.at(-1)![0]).pathname).toBe(path);
  }
});

it('keeps the real Polar signature verifier on both webhook paths with no redirect', async () => {
  const onPayload = vi.fn();
  const post = Webhooks({
    webhookSecret: randomBytes(32).toString('base64'),
    onPayload,
  });
  const handle = createBridgeHandler({
    mounts,
    start: { fetch: async () => new Response('page') },
    proxy: async () => NextResponse.next(),
    assets: () => undefined,
    endpoints: [{ pattern: '/api/payment/webhooks', module: { POST: post } }],
    centralApiOrigin: () => 'https://central.invalid',
  });
  for (const origin of [
    'https://pay.tuturuuu.com',
    'https://tuturuuu.com/pay',
  ]) {
    for (const signature of ['', 'v1,invalid']) {
      const response = await handle(
        new Request(`${origin}/api/payment/webhooks`, {
          method: 'POST',
          body: '{ "type": "order.created" }',
          headers: {
            'content-type': 'application/json',
            'webhook-id': 'synthetic-invalid',
            'webhook-timestamp': String(Math.floor(Date.now() / 1000)),
            'webhook-signature': signature,
          },
        }),
        env,
        ctx
      );
      expect(response.status).toBe(403);
      expect(response.headers.get('location')).toBeNull();
    }
  }
  expect(onPayload).not.toHaveBeenCalled();
});

it('verifies signed raw bytes at the mount and rejects tampering and stale timestamps', async () => {
  const secret = randomBytes(32).toString('hex');
  const onPayload = vi.fn();
  const post = Webhooks({ webhookSecret: secret, onPayload });
  const handle = createBridgeHandler({
    mounts,
    start: { fetch: async () => new Response('page') },
    proxy: async () => NextResponse.next(),
    assets: () => undefined,
    endpoints: [{ pattern: '/api/payment/webhooks', module: { POST: post } }],
    centralApiOrigin: () => 'https://central.invalid',
  });
  const now = new Date().toISOString();
  const body = JSON.stringify(
    {
      type: 'customer.created',
      timestamp: now,
      data: {
        id: 'synthetic',
        created_at: now,
        modified_at: null,
        metadata: {},
        email: 'fixture@example.invalid',
        email_verified: false,
        type: 'individual',
        name: null,
        billing_name: null,
        billing_address: null,
        tax_id: null,
        organization_id: 'synthetic',
        deleted_at: null,
        avatar_url: null,
      },
    },
    null,
    2
  );
  const send = (payload: string, timestamp: number) => {
    const id = 'synthetic-signed';
    const signature = createHmac('sha256', secret)
      .update(`${id}.${timestamp}.${body}`)
      .digest('base64');
    return handle(
      new Request('https://tuturuuu.com/pay/api/payment/webhooks', {
        method: 'POST',
        body: payload,
        headers: {
          'content-type': 'application/json',
          'webhook-id': id,
          'webhook-timestamp': String(timestamp),
          'webhook-signature': `v1,${signature}`,
        },
      }),
      env,
      ctx
    );
  };
  const timestamp = Math.floor(Date.now() / 1000);
  expect((await send(body, timestamp)).status).toBe(200);
  expect(onPayload).toHaveBeenCalledTimes(1);
  expect((await send(`${body} `, timestamp)).status).toBe(403);
  expect((await send(body, timestamp - 3600)).status).toBe(403);
  expect(onPayload).toHaveBeenCalledTimes(1);
});

it('keeps cross-origin cookie mutations denied before app dispatch', async () => {
  const proxy = vi.fn(async () => NextResponse.next());
  const handle = createBridgeHandler({
    mounts,
    start: { fetch: async () => new Response('page') },
    proxy,
    assets: () => undefined,
    centralApiOrigin: () => 'https://central.invalid',
  });
  const response = await handle(
    new Request('https://tuturuuu.com/pay/api/payment/seats', {
      method: 'POST',
      headers: {
        cookie: 'sb-project-auth-token=fixture',
        origin: 'https://evil.invalid',
      },
    }),
    env,
    ctx
  );
  expect(response.status).toBe(403);
  expect(proxy).not.toHaveBeenCalled();
});

it('normalizes /pay/ and keeps mounted assets and WebGL response policies', async () => {
  vi.stubEnv('VITE_PAY_NATIVE_ROOT_HOST', 'pay.tuturuuu.com');
  vi.resetModules();
  const { default: config } = await import('../start-bridge.config');
  const wrap = (path: string, response = new Response('fixture')) =>
    config.wrapResponse(response, {
      request: new Request(`https://tuturuuu.com${path}`),
      env: { ASSETS: { fetch: async () => new Response('asset') } },
    });
  const canonical = await wrap('/pay/?a=1');
  expect(canonical.status).toBe(301);
  expect(canonical.headers.get('location')).toBe(
    'https://tuturuuu.com/pay?a=1'
  );
  const asset = await wrap(
    '/pay/assets/fixture.js',
    new Response('asset', {
      headers: {
        'content-type': 'text/javascript',
        'cache-control': 'public, max-age=3600',
      },
    })
  );
  expect(asset.headers.get('cache-control')).toBe('public, max-age=3600');
  const webgl = await wrap(
    '/pay/api/v1/workspaces/ws/external-projects/assets/id/webgl',
    new Response('asset', {
      headers: { 'content-security-policy': 'sandbox allow-scripts' },
    })
  );
  expect(webgl.headers.get('x-frame-options')).toBeNull();
  expect(webgl.headers.get('content-security-policy')).toBe(
    'sandbox allow-scripts'
  );
});

it('rejects conflicting build bases and keeps staging assets at the root', () => {
  expect(() =>
    applyPayNativeProfileEnv({
      VITE_PAY_NATIVE_PROFILE: 'staging',
      TUTURUUU_BASE_PATH: '/pay',
    })
  ).toThrow('TUTURUUU_BASE_PATH conflicts');
  const staging: Record<string, string | undefined> = {};
  applyPayNativeProfileEnv(staging);
  expect(staging.TUTURUUU_BASE_PATH).toBe('');
  const production: Record<string, string | undefined> = {
    VITE_PAY_NATIVE_PROFILE: 'production',
  };
  applyPayNativeProfileEnv(production);
  expect(production.TUTURUUU_BASE_PATH).toBe('/pay');
});
