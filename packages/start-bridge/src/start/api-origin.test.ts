import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssetsBinding } from '../core/assets';
import { createBridgeHandler } from './handler';

afterEach(() => vi.unstubAllGlobals());

type Env = {
  ASSETS: AssetsBinding;
  INVENTORY_APP_URL: string;
};

const handle = createBridgeHandler<
  Env,
  { waitUntil(work: Promise<unknown>): void }
>({
  mounts: {
    app: 'storefront',
    rootHosts: ['storefront.tuturuuu.com'],
    mountHosts: ['tuturuuu.com'],
    basePath: '/storefront',
  },
  start: { fetch: async () => new Response('page') },
  proxy: async () => NextResponse.next(),
  assets: (env) => env.ASSETS,
  centralApiOrigin: () => 'https://tuturuuu.com',
  // Storefront's Next fallback: Inventory APIs to Inventory, the rest to Web.
  apiOrigin: (_request, { env, path }) =>
    path.startsWith('/api/v1/inventory/') ? env.INVENTORY_APP_URL : undefined,
});

const env: Env = {
  ASSETS: { fetch: async () => new Response('asset') },
  INVENTORY_APP_URL: 'https://inventory.tuturuuu.com',
};

function stubUpstream() {
  const seen: {
    url: string;
    host: string | null;
    connection: string | null;
  }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (request: Request) => {
      seen.push({
        url: request.url,
        host: request.headers.get('host'),
        connection: request.headers.get('connection'),
      });
      return new Response('upstream');
    })
  );
  return seen;
}

describe('apiOrigin', () => {
  it('routes each unowned /api request through the central forward', async () => {
    const seen = stubUpstream();
    const ctx = { waitUntil: vi.fn() };
    await handle(
      new Request(
        'https://tuturuuu.com/storefront/api/v1/inventory/items?q=1',
        {
          headers: { connection: 'keep-alive' },
        }
      ),
      env,
      ctx
    );
    await handle(
      new Request('https://tuturuuu.com/storefront/api/v1/users/me'),
      env,
      ctx
    );
    // Base stripped, query kept, hop-by-hop headers removed, as for Web.
    expect(seen.map((call) => call.url)).toEqual([
      'https://inventory.tuturuuu.com/api/v1/inventory/items?q=1',
      'https://tuturuuu.com/api/v1/users/me',
    ]);
    expect(seen[0]?.connection).toBeNull();
  });

  it('keeps the loop guard for a selected origin', async () => {
    const seen = stubUpstream();
    const response = await handle(
      new Request('https://inventory.tuturuuu.com/api/v1/inventory/items'),
      { ...env, INVENTORY_APP_URL: 'https://inventory.tuturuuu.com' },
      { waitUntil: vi.fn() }
    );
    // inventory.tuturuuu.com is not a Storefront host, so it is served at
    // the root: forwarding to its own origin would loop.
    expect(response.status).toBe(503);
    expect(seen).toEqual([]);
  });
});
