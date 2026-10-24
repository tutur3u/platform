// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Exercises the real Worker entry: only the shared guard's verdict, Start SSR
// and the network are faked, so the guard wiring itself is under test.
const guardApiProxyRequest = vi.hoisted(() => vi.fn());
const renderStart = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({ guardApiProxyRequest }));
vi.mock('@tanstack/react-start/server-entry', () => ({
  default: { fetch: renderStart },
}));
vi.mock('./supabase-store.server', () => ({
  createSupabaseLinkStore: () => {
    throw new Error('a guarded API request must not open the store');
  },
}));

const { shortenerWorkerRequest } = await import('../../cloudflare/worker');

const origin = 'https://tuturuuu-shortener-vite-staging.example.workers.dev';
const env = {
  ASSETS: { fetch: vi.fn(async () => new Response('asset')) },
  INTERNAL_WEB_API_ORIGIN: 'https://central.example',
};
const upstream = vi.fn(async (_input: Request) => Response.json({ ok: true }));

beforeEach(() => {
  guardApiProxyRequest.mockReset();
  upstream.mockClear();
  vi.stubGlobal('fetch', upstream);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Shortener Worker API guard wiring', () => {
  it('returns the shared guard rejection without forwarding or owning', async () => {
    guardApiProxyRequest.mockImplementation(
      async () => new Response('limited', { status: 429 })
    );
    for (const path of ['/api/v1/workspaces?a=1', '/api/verify', '/api']) {
      const response = await shortenerWorkerRequest(
        new Request(`${origin}${path}`, { method: 'POST', body: '{}' }),
        env
      );
      expect(response.status).toBe(429);
      expect(await response.text()).toBe('limited');
    }
    expect(guardApiProxyRequest).toHaveBeenCalledTimes(3);
    for (const [request, options] of guardApiProxyRequest.mock.calls) {
      expect(new URL(request.url).origin).toBe(origin);
      expect(options).toEqual({ prefixBase: 'proxy:shortener:api' });
    }
    expect(upstream).not.toHaveBeenCalled();
    expect(renderStart).not.toHaveBeenCalled();
  });

  it('forwards to the central API only after the guard admits the request', async () => {
    guardApiProxyRequest.mockResolvedValue(null);
    const response = await shortenerWorkerRequest(
      new Request(`${origin}/api/v1/workspaces?a=1&a=2`),
      env
    );
    expect(await response.json()).toEqual({ ok: true });
    expect(guardApiProxyRequest).toHaveBeenCalledTimes(1);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(upstream.mock.calls[0]?.[0].url).toBe(
      'https://central.example/api/v1/workspaces?a=1&a=2'
    );
    expect(guardApiProxyRequest.mock.invocationCallOrder[0]).toBeLessThan(
      upstream.mock.invocationCallOrder[0] ?? 0
    );
  });
});
