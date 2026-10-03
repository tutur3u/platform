import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authorize, admin, rpc } = vi.hoisted(() => ({
  authorize: vi.fn(),
  admin: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock('@tuturuuu/inventory-core/commerce/auth', () => ({
  authorizeInventoryWorkspace: authorize,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({ createAdminClient: admin }));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: vi.fn(),
}));

import { GET, POST } from './route';

const sourceId = '00000000-0000-4000-8000-000000000001';
const targetId = '00000000-0000-4000-8000-000000000002';
const selection = { kind: 'product', sourceId, targetId };
const payload = {
  ...selection,
  version: 'preview-version',
  metadata: 'target',
  stockPolicy: 'source',
};
const context = { params: Promise.resolve({ wsId: 'raw' }) };
function permitted(
  values = [
    'manage_inventory_catalog',
    'delete_inventory',
    'adjust_inventory_stock',
  ]
) {
  authorize.mockResolvedValue({
    ok: true,
    value: {
      wsId: 'normalized',
      userId: 'actor',
      permissions: { containsPermission: (p: string) => values.includes(p) },
    },
  });
}
function post(body: unknown = payload) {
  return POST(
    new Request('https://example.test/api', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    context
  );
}
function get(value: Record<string, string> = selection) {
  return GET(
    new Request(`https://example.test/api?${new URLSearchParams(value)}`),
    context
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  permitted();
  admin.mockResolvedValue({ schema: () => ({ rpc }) });
  rpc.mockResolvedValue({ data: { merged: true, targetId }, error: null });
});

describe('inventory merge boundary', () => {
  it.each([401, 403, 500])(
    'preserves authorization or membership failure %s before RPC',
    async (status) => {
      authorize.mockResolvedValue({
        ok: false,
        response: new Response(null, { status }),
      });
      expect((await post()).status).toBe(status);
      expect(admin).not.toHaveBeenCalled();
    }
  );
  it.each([
    ['manage_inventory_catalog', 'adjust_inventory_stock'],
    ['delete_inventory', 'adjust_inventory_stock'],
    ['manage_inventory_catalog', 'delete_inventory'],
    ['create_inventory', 'delete_inventory', 'adjust_inventory_stock'],
  ])(
    'requires update, delete and stock permissions together (%j)',
    async (...values) => {
      permitted(values as string[]);
      expect((await post()).status).toBe(403);
      expect(admin).not.toHaveBeenCalled();
    }
  );
  it('does not let catalog management authorize a warehouse merge', async () => {
    expect((await post({ ...payload, kind: 'warehouse' })).status).toBe(403);
  });
  it('accepts warehouse setup and legacy update/stock permissions', async () => {
    permitted([
      'manage_inventory_setup',
      'delete_inventory',
      'update_stock_quantity',
    ]);
    expect((await post({ ...payload, kind: 'warehouse' })).status).toBe(200);
    permitted([
      'update_inventory',
      'delete_inventory',
      'update_stock_quantity',
    ]);
    expect((await post()).status).toBe(200);
  });
  it.each([
    { ...payload, sourceId: 'invalid' },
    { ...payload, targetId: sourceId },
    { ...payload, version: '' },
    { ...payload, metadata: undefined },
    { ...payload, stockPolicy: undefined },
    { ...payload, kind: 'supplier' },
  ])('rejects malformed or incomplete merge input', async (body) => {
    expect((await post(body)).status).toBe(400);
    expect(admin).not.toHaveBeenCalled();
  });
  it('previews uncached scoped records without applying changes', async () => {
    const result = await get();
    expect(result.headers.get('Cache-Control')).toBe('no-store');
    expect(rpc).toHaveBeenCalledWith('preview_inventory_merge', {
      p_ws_id: 'normalized',
      p_kind: 'product',
      p_source_id: sourceId,
      p_target_id: targetId,
    });
  });
  it('applies mandatory policies/version and captured actor, ignoring supplied actor/workspace', async () => {
    await post({ ...payload, actorId: 'attacker', wsId: 'another' });
    expect(rpc).toHaveBeenCalledWith('apply_inventory_merge', {
      p_ws_id: 'normalized',
      p_kind: 'product',
      p_source_id: sourceId,
      p_target_id: targetId,
      p_version: 'preview-version',
      p_metadata_policy: 'target',
      p_stock_policy: 'source',
      p_actor_id: 'actor',
    });
  });
  it.each([
    ['23P01', 409],
    ['55P03', 409],
    ['40P01', 409],
    ['40001', 409],
    ['23505', 409],
    ['23514', 409],
    ['23503', 404],
    ['PGRST202', 503],
    ['PGRST106', 503],
    ['42883', 503],
    ['3F000', 503],
    ['XX000', 500],
  ])('sanitizes RPC %s to %s', async (code, status) => {
    rpc.mockResolvedValue({
      data: null,
      error: { code, message: 'private sensitive detail' },
    });
    const result = await post();
    expect(result.status).toBe(status);
    expect(await result.text()).not.toContain('sensitive');
  });
  it('sanitizes unexpected infrastructure failures', async () => {
    admin.mockRejectedValue(new Error('private sensitive detail'));
    const result = await post();
    expect(result.status).toBe(500);
    expect(await result.text()).not.toContain('sensitive');
  });
});
