import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { authorize, rpc, listing, admin } = vi.hoisted(() => ({
  authorize: vi.fn(),
  rpc: vi.fn(),
  listing: vi.fn(),
  admin: vi.fn(),
}));
vi.mock('./commerce/auth', () => ({ authorizeInventoryWorkspace: authorize }));
vi.mock('./commerce/auto-listing', () => ({
  autoCreateProductListing: listing,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({ createAdminClient: admin }));

import {
  canCreateOfflineResource,
  handleOfflineCreate,
} from './offline-create-route';
import { parseOfflineCreatePayload } from './offline-create-schema';

const operationId = '00005743-0000-4000-8000-000000000100';
const serverId = '00005743-0000-4000-8000-000000000200';
const contract = 'inventory-offline-create-v1';
const permissions = (values: string[]) => ({
  containsPermission: (value: string) => values.includes(value),
});
function request(
  kind = 'category',
  payload: Record<string, unknown> = { name: 'Synthetic' }
) {
  return new Request('https://example.invalid/api/offline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation_id: operationId, kind, payload }),
  });
}
function acknowledged(resource = 'category', replayed = false) {
  return {
    data: { contract, resource, replayed, data: { id: serverId } },
    error: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  authorize.mockResolvedValue({
    ok: true,
    value: {
      userId: 'captured-actor',
      wsId: 'normalized-workspace',
      permissions: permissions(['create_inventory']),
    },
  });
  admin.mockResolvedValue({ schema: () => ({ rpc }) });
  rpc.mockResolvedValue(acknowledged());
});

describe('deduplicated native create boundary', () => {
  it('reports merged source identities as actionable conflicts without creating a listing', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: '23514',
        message:
          'Inventory identity was merged; refresh and select its destination before retrying',
      },
    });
    const result = await handleOfflineCreate(request(), 'workspace');
    expect(result.status).toBe(409);
    expect(await result.json()).toMatchObject({
      code: 'MERGED_INVENTORY_IDENTITY',
      message:
        'Inventory was merged. Refresh and select its destination before retrying.',
    });
    expect(listing).not.toHaveBeenCalled();
  });
  it('passes only the captured actor/workspace and validated payload to RPC', async () => {
    const response = await handleOfflineCreate(request(), 'raw-workspace');
    expect(response.status).toBe(201);
    expect(response.headers.get('X-Tuturuuu-Offline-Contract')).toBe(contract);
    expect(rpc).toHaveBeenCalledWith('apply_inventory_offline_create', {
      p_actor_id: 'captured-actor',
      p_ws_id: 'normalized-workspace',
      p_operation_id: operationId,
      p_resource: 'category',
      p_payload: { name: 'Synthetic' },
    });
    expect((await response.json()).data.id).toBe(serverId);
  });

  it('returns the original receipt ID on a replay without additional create calls', async () => {
    rpc.mockResolvedValue(acknowledged('category', true));
    const response = await handleOfflineCreate(request(), 'ws');
    expect(response.status).toBe(200);
    expect((await response.json()).replayed).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(listing).not.toHaveBeenCalled();
  });

  it('permission revocation denies a retry before reading or applying its receipt', async () => {
    authorize.mockResolvedValue({
      ok: true,
      value: {
        userId: 'captured-actor',
        wsId: 'ws',
        permissions: permissions([]),
      },
    });
    rpc.mockResolvedValue(acknowledged('category', true));
    const response = await handleOfflineCreate(request(), 'ws');
    expect(response.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
    expect(admin).not.toHaveBeenCalled();
  });

  it('preserves recognized domain 404 so the client must not auto-retry it', async () => {
    authorize.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ message: 'Not found' }), {
        status: 404,
      }),
    });
    const response = await handleOfflineCreate(request(), 'ws');
    expect(response.status).toBe(404);
    expect(response.headers.get('X-Tuturuuu-Offline-Contract')).toBe(contract);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(['PGRST202', '42883', '42P01', '42703'])(
    '%s is an explicit retryable contract gap',
    async (code) => {
      rpc.mockResolvedValue({
        data: null,
        error: { code, message: 'private details' },
      });
      const response = await handleOfflineCreate(request(), 'ws');
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.code).toBe('OFFLINE_CONTRACT_UNAVAILABLE');
      expect(JSON.stringify(body)).not.toContain('private details');
    }
  );

  it('same-request different payload is a permanent conflict', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '23505' } });
    const response = await handleOfflineCreate(request(), 'ws');
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('OFFLINE_CREATE_REJECTED');
  });

  it('missing authoritative ID fails closed without a legacy POST fallback', async () => {
    rpc.mockResolvedValue({
      data: { contract, resource: 'category', replayed: false, data: {} },
      error: null,
    });
    const response = await handleOfflineCreate(request(), 'ws');
    expect(response.status).toBe(500);
    expect((await response.json()).code).toBe(
      'OFFLINE_CONTRACT_RESPONSE_MISMATCH'
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('a successful RPC with a different resource is a response mismatch', async () => {
    rpc.mockResolvedValue(acknowledged('warehouse'));
    const response = await handleOfflineCreate(request(), 'ws');
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.code).toBe('OFFLINE_CONTRACT_RESPONSE_MISMATCH');
    expect(JSON.stringify(body)).not.toContain(serverId);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    { kind: 'unknown', payload: { name: 'Synthetic' } },
    { kind: 'owner', payload: { name: 'Synthetic', actor_id: serverId } },
    {
      kind: 'product',
      payload: { name: 'Synthetic', category_id: 'bad', owner_id: serverId },
    },
    { kind: 'finance_category', payload: { name: 'Synthetic' } },
  ])(
    'invalid payload/kind is rejected before RPC %#',
    async ({ kind, payload }) => {
      const response = await handleOfflineCreate(request(kind, payload), 'ws');
      expect(response.status).toBe(400);
      expect(rpc).not.toHaveBeenCalled();
    }
  );

  it('Finance categories use their own permission and allowed app sessions', async () => {
    authorize.mockResolvedValue({
      ok: true,
      value: {
        userId: 'finance-actor',
        wsId: 'ws',
        permissions: permissions(['create_transactions']),
      },
    });
    rpc.mockResolvedValue(acknowledged('finance_category'));
    const response = await handleOfflineCreate(
      request('finance_category', {
        name: 'Synthetic',
        is_expense: false,
      }),
      'ws'
    );
    expect(response.status).toBe(201);
    expect(authorize.mock.calls[0]?.[2]).toEqual({
      appSessionTargets: ['inventory', 'finance'],
    });
  });
});

describe('kind-specific scope and limits', () => {
  it.each([
    ['warehouse', 'create_inventory'],
    ['period', 'create_inventory_sales'],
  ] as const)(
    '%s requires its owning permission before RPC',
    async (kind, permission) => {
      expect(
        parseOfflineCreatePayload(kind, { name: 'Synthetic' }).success
      ).toBe(true);
      expect(parseOfflineCreatePayload(kind, { name: '   ' }).success).toBe(
        false
      );
      expect(
        canCreateOfflineResource(kind, {}, permissions([permission]))
      ).toBe(true);
      expect(canCreateOfflineResource(kind, {}, permissions([]))).toBe(false);
      rpc.mockResolvedValue(acknowledged(kind));
      authorize.mockResolvedValue({
        ok: true,
        value: {
          userId: 'captured-actor',
          wsId: 'ws',
          permissions: permissions([permission]),
        },
      });
      const allowed = await handleOfflineCreate(request(kind), 'ws');
      expect(allowed.status).toBe(201);
      expect(rpc).toHaveBeenCalledWith(
        'apply_inventory_offline_create',
        expect.objectContaining({ p_resource: kind })
      );
      rpc.mockClear();
      admin.mockClear();
      authorize.mockResolvedValue({
        ok: true,
        value: {
          userId: 'captured-actor',
          wsId: 'ws',
          permissions: permissions([]),
        },
      });
      const denied = await handleOfflineCreate(request(kind), 'ws');
      expect(denied.status).toBe(403);
      expect(rpc).not.toHaveBeenCalled();
      expect(admin).not.toHaveBeenCalled();
    }
  );

  it('Finance payloads apply repository text limits before any effect', () => {
    for (const [key, length] of [
      ['name', 256],
      ['description', 10001],
      ['icon', 1001],
      ['color', 1001],
    ] as const) {
      expect(
        parseOfflineCreatePayload('finance_category', {
          name: 'Synthetic',
          is_expense: false,
          [key]: 'x'.repeat(length),
        }).success
      ).toBe(false);
    }
  });
  it('best-effort listing failure cannot hide committed product acknowledgment', async () => {
    authorize.mockResolvedValue({
      ok: true,
      value: {
        userId: 'actor',
        wsId: 'ws',
        permissions: permissions([
          'manage_inventory_catalog',
          'adjust_inventory_stock',
        ]),
      },
    });
    rpc.mockResolvedValue(acknowledged('product'));
    listing.mockRejectedValue(new Error('Listing unavailable'));
    const payload = {
      name: 'Synthetic',
      category_id: operationId,
      owner_id: serverId,
      inventory: [
        {
          unit_id: operationId,
          warehouse_id: serverId,
          amount: null,
          min_amount: 0,
          price: 0,
        },
      ],
    };
    const created = await handleOfflineCreate(
      request('product', payload),
      'ws'
    );
    expect(created.status).toBe(201);
    expect((await created.json()).data.id).toBe(serverId);
    rpc.mockResolvedValue(acknowledged('product', true));
    const replayed = await handleOfflineCreate(
      request('product', payload),
      'ws'
    );
    expect(replayed.status).toBe(200);
    expect(listing).toHaveBeenCalledTimes(1);
  });

  it('catalog permission cannot smuggle initial stock without stock permission', () => {
    expect(
      canCreateOfflineResource(
        'product',
        { inventory: [{}] },
        permissions(['manage_inventory_catalog'])
      )
    ).toBe(false);
    expect(
      canCreateOfflineResource(
        'product',
        { inventory: [] },
        permissions(['manage_inventory_catalog'])
      )
    ).toBe(true);
  });
  it('owner/manufacturer/unit/category permissions mirror owning handlers', () => {
    const updateOnly = permissions(['update_inventory']);
    expect(canCreateOfflineResource('owner', {}, updateOnly)).toBe(true);
    expect(canCreateOfflineResource('manufacturer', {}, updateOnly)).toBe(true);
    expect(canCreateOfflineResource('unit', {}, updateOnly)).toBe(false);
    expect(
      canCreateOfflineResource(
        'category',
        {},
        permissions(['manage_inventory_setup'])
      )
    ).toBe(false);
  });
  it('preserves unlimited stock null and optional product field absence', () => {
    const result = parseOfflineCreatePayload('product', {
      name: 'Synthetic',
      category_id: operationId,
      owner_id: serverId,
      inventory: [
        {
          unit_id: operationId,
          warehouse_id: serverId,
          amount: null,
          min_amount: 0,
          price: 0,
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('finance_category_id');
      expect(result.data).toMatchObject({ inventory: [{ amount: null }] });
    }
  });
  it('retains period scope, date, product rule and scheduled pricing validation', () => {
    expect(
      parseOfflineCreatePayload('period', {
        name: 'Synthetic',
        product_scope: 'allowlist',
        product_ids: [serverId],
        starts_at: '2026-10-03',
        ends_at: '2026-10-04',
        pricing_mode: 'scheduled',
        time_zone: 'Asia/Ho_Chi_Minh',
      }).success
    ).toBe(true);
    expect(
      parseOfflineCreatePayload('period', {
        name: 'Synthetic',
        product_scope: 'allowlist',
        product_ids: [],
      }).success
    ).toBe(false);
    expect(
      parseOfflineCreatePayload('period', {
        name: 'Synthetic',
        pricing_mode: 'scheduled',
      }).success
    ).toBe(false);
    expect(
      parseOfflineCreatePayload('period', {
        name: 'Synthetic',
        starts_at: '2026-10-04',
        ends_at: '2026-10-03',
      }).success
    ).toBe(false);
  });
});
