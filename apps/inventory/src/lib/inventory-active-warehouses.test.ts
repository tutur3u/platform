import { createClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  admin: vi.fn(),
}));
vi.mock('@tuturuuu/inventory-core/commerce/auth', () => ({
  authorizeInventoryWorkspace: mocks.authorize,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/inventory-core/actor', () => ({
  getInventoryActorContext: vi.fn(),
}));
vi.mock('@tuturuuu/inventory-core/audit', () => ({
  createInventoryAuditLog: vi.fn(),
}));

import { GET as inventoryGET } from '@/app/api/v1/workspaces/[wsId]/inventory/warehouses/route';
import { GET as productGET } from '@/app/api/v1/workspaces/[wsId]/product-warehouses/route';

const rows = [{ id: 'active-warehouse', name: 'Main', ws_id: 'normalized-ws' }];

// Use the actual Supabase request builder: verify the outbound wire contract,
// not a mocked chain that could accept an oversized exclusion list.
function database(status = 200) {
  const fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify(status === 200 ? rows : { code: 'PGRST205' }),
        {
          status,
          headers: {
            'content-type': 'application/json',
            'content-range': '1-1/4',
          },
        }
      )
  );
  mocks.admin.mockResolvedValue(
    createClient('https://database.example.invalid', 'synthetic-test-key', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch },
    })
  );
  return fetch;
}

function sequence(results: Array<{ status: number; body: unknown }>) {
  const fetch = vi.fn(async () => {
    const result = results.shift();
    if (!result) throw new Error('Unexpected database request');
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { 'content-type': 'application/json', 'content-range': '1-1/4' },
    });
  });
  mocks.admin.mockResolvedValue(
    createClient('https://database.example.invalid', 'synthetic-test-key', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch },
    })
  );
  return fetch;
}

function authorized(granted = true) {
  mocks.authorize.mockResolvedValue({
    ok: true,
    value: {
      wsId: 'normalized-ws',
      permissions: { containsPermission: () => granted },
    },
  });
}

const params = () => ({ params: Promise.resolve({ wsId: 'personal' }) });

describe.each([
  ['inventory', inventoryGET],
  ['product', productGET],
] as const)('%s warehouse list anti-join contract', (kind, GET) => {
  beforeEach(() => {
    vi.clearAllMocks();
    authorized();
  });

  it('uses one bounded view request with count/search/range after authorization', async () => {
    const fetch = database();
    const response = await GET(
      new Request(
        'https://app.invalid/api?response=paginated&page=2&pageSize=1&q=Main'
      ),
      params()
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ count: 4, data: rows });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [input, init] = fetch.mock.calls[0]! as unknown as [
      string,
      RequestInit,
    ];
    const url = new URL(input);
    expect(url.pathname).toBe('/rest/v1/inventory_active_warehouses');
    expect(url.searchParams.get('ws_id')).toBe('eq.normalized-ws');
    expect(url.searchParams.get('name')).toBe('ilike.%Main%');
    expect(url.searchParams.get('offset')).toBe('1');
    expect(url.searchParams.get('limit')).toBe('1');
    expect(url.searchParams.has('id')).toBe(false);
    expect(input).not.toContain('not.in');
    expect(input.length).toBeLessThan(300);
    const headers = new Headers(init.headers);
    expect(headers.get('accept-profile')).toBe('private');
    expect(headers.get('prefer')).toContain('count=exact');
    expect(mocks.authorize.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.admin.mock.invocationCallOrder[0]!
    );
    if (kind === 'inventory')
      expect(url.searchParams.get('order')).toBe('name.asc');
  });

  it('preserves the non-paginated response shape', async () => {
    database();
    const response = await GET(
      new Request('https://app.invalid/api'),
      params()
    );
    expect(await response.json()).toEqual(
      kind === 'inventory' ? { data: rows } : rows
    );
  });

  it('fails closed when the anti-join view is unavailable', async () => {
    const fetch = database(404);
    const response = await GET(
      new Request('https://app.invalid/api'),
      params()
    );
    expect(response.status).toBe(500);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(['PGRST205', '42P01'])(
    'preserves legacy ordinary lists after current baseline RPC proves no aliases (%s)',
    async (code) => {
      const fetch = sequence([
        { status: 404, body: { code } },
        { status: 200, body: { warehouses: rows } },
        { status: 200, body: rows },
        { status: 200, body: { warehouses: rows } },
      ]);
      const response = await GET(
        new Request(
          'https://app.invalid/api?response=paginated&page=2&pageSize=1&q=Main'
        ),
        params()
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ count: 4, data: rows });
      expect(fetch).toHaveBeenCalledTimes(4);
      const requests = fetch.mock.calls as unknown as Array<
        [string, RequestInit]
      >;
      expect(new URL(requests[1]![0]).pathname).toBe(
        '/rest/v1/rpc/get_inventory_product_form_options'
      );
      expect(JSON.parse(requests[1]![1].body as string)).toEqual({
        p_ws_id: 'normalized-ws',
      });
      const legacyUrl = new URL(requests[2]![0]);
      expect(legacyUrl.pathname).toBe('/rest/v1/inventory_warehouses');
      expect(legacyUrl.searchParams.get('ws_id')).toBe('eq.normalized-ws');
      expect(legacyUrl.searchParams.get('name')).toBe('ilike.%Main%');
      expect(legacyUrl.searchParams.get('offset')).toBe('1');
      expect(legacyUrl.searchParams.get('limit')).toBe('1');
      expect(
        requests.every(([url]) => url.length < 300 && !url.includes('not.in'))
      ).toBe(true);
    }
  );

  it.each([
    { warehouses: rows, inventoryMergeSchema: 'partial' },
    { warehouses: rows, inventoryMergeSchema: 'ready' },
    { warehouses: rows, inventoryMergeSchema: null },
    { warehouses: rows, inventoryMergeSchema: 'unexpected' },
    { warehouses: [{ id: 'alias', ws_id: 'other-workspace', name: 'Stale' }] },
    { warehouses: [{}] },
    {},
  ])(
    'never exposes alias sources from stale cache or partial schema (%j)',
    async (body) => {
      const fetch = sequence([
        { status: 404, body: { code: 'PGRST205' } },
        { status: 200, body },
      ]);
      expect(
        (await GET(new Request('https://app.invalid/api'), params())).status
      ).toBe(500);
      expect(fetch).toHaveBeenCalledTimes(2);
    }
  );

  it.each(['42501', 'XX000', 'PGRST106'])(
    'does not downgrade genuine view/schema errors (%s)',
    async (code) => {
      const fetch = sequence([{ status: 500, body: { code } }]);
      expect(
        (await GET(new Request('https://app.invalid/api'), params())).status
      ).toBe(500);
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  );

  it('fails closed when the baseline legacy proof errors', async () => {
    const fetch = sequence([
      { status: 404, body: { code: 'PGRST205' } },
      { status: 500, body: { code: 'XX000' } },
    ]);
    expect(
      (await GET(new Request('https://app.invalid/api'), params())).status
    ).toBe(500);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('preserves genuine base-table failures after verified legacy readiness', async () => {
    const fetch = sequence([
      { status: 404, body: { code: 'PGRST205' } },
      { status: 200, body: { warehouses: [] } },
      { status: 500, body: { code: '42501' } },
    ]);
    expect(
      (await GET(new Request('https://app.invalid/api'), params())).status
    ).toBe(500);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('discards a raw legacy result when migration completes between requests', async () => {
    const fetch = sequence([
      { status: 404, body: { code: 'PGRST205' } },
      { status: 200, body: { warehouses: rows } },
      { status: 200, body: [{ id: 'now-merged-source' }] },
      { status: 200, body: { warehouses: [], inventoryMergeSchema: 'ready' } },
    ]);
    expect(
      (await GET(new Request('https://app.invalid/api'), params())).status
    ).toBe(500);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('denies access before creating an admin client', async () => {
    authorized(false);
    expect(
      (await GET(new Request('https://app.invalid/api'), params())).status
    ).toBe(403);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it('rejects invalid pagination before any database request', async () => {
    expect(
      (await GET(new Request('https://app.invalid/api?page=0'), params()))
        .status
    ).toBe(400);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
});
