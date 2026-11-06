import { createRootRoute, createRouter } from '@tanstack/react-router';
import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { describe, expect, it, vi } from 'vitest';
import { appBaseHeadScript } from '../start/base-path';
import { createBridgeHandler } from '../start/handler';
import { createNonce, defaultContentSecurityPolicy, requestNonce } from './csp';

const ctx = { waitUntil: vi.fn() };

// The Start entry stand-in builds the app router the way getRouter() should:
// `ssr: { nonce: requestNonce() }`, plus the bridge head script.
const handle = createBridgeHandler<Record<string, never>, typeof ctx>({
  start: {
    fetch: async () => {
      const router = createRouter({
        routeTree: createRootRoute(),
        ssr: { nonce: requestNonce() },
      });
      return Response.json({
        router: router.options.ssr?.nonce,
        headScript: appBaseHeadScript().nonce,
      });
    },
  },
  proxy: async () => NextResponse.next(),
  assets: () => undefined,
  centralApiOrigin: () => 'https://central.example',
  csp: defaultContentSecurityPolicy,
});

async function page() {
  const response = await handle(new Request('https://x.test/'), {}, ctx);
  const policy = response.headers.get('content-security-policy') ?? '';
  const nonce = /'nonce-([^']+)'/u.exec(policy)?.[1];
  return {
    policy,
    nonce,
    body: (await response.json()) as Record<string, string>,
  };
}

describe('per-response CSP nonce', () => {
  it('stamps the router and head script with the nonce in its own CSP', async () => {
    const first = await page();
    expect(first.policy).toContain("script-src 'nonce-");
    expect(first.policy).toContain("object-src 'none'");
    expect(first.nonce).toBeTruthy();
    expect(first.body).toEqual({
      router: first.nonce,
      headScript: first.nonce,
    });
  });

  it('is fresh for every response and absent outside a request', async () => {
    const nonces = new Set<string | undefined>();
    for (let i = 0; i < 5; i++) nonces.add((await page()).nonce);
    expect(nonces.size).toBe(5);
    expect(requestNonce()).toBeUndefined();
    expect(createNonce()).toMatch(/^[A-Za-z0-9+/]{22}==$/u);
  });

  it('sends no policy when csp is not configured', async () => {
    const plain = createBridgeHandler<Record<string, never>, typeof ctx>({
      start: { fetch: async () => new Response(String(requestNonce())) },
      proxy: async () => NextResponse.next(),
      assets: () => undefined,
      centralApiOrigin: () => 'https://central.example',
    });
    const response = await plain(new Request('https://x.test/'), {}, ctx);
    expect(response.headers.get('content-security-policy')).toBeNull();
    expect(await response.text()).toBe('undefined');
  });
});
