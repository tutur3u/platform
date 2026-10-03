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
    expect(fetch).toHaveBeenCalledTimes(1);
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
