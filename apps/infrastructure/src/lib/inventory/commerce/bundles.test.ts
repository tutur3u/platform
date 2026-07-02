import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBundle,
  InvalidInventoryBundleComponentTargetError,
  listBundles,
} from './bundles';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  const schema = vi.fn(() => ({ rpc }));
  return {
    createAdminClient: vi.fn(),
    rpc,
    schema,
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => mocks.createAdminClient(),
}));

describe('inventory bundle commerce helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue({ schema: mocks.schema });
  });

  it('lists bundles through the private bundle RPC', async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ bundle: { id: 'bundle-1', name: 'Kit' }, total_count: 1 }],
      error: null,
    });

    await expect(
      listBundles('ws-1', { pageSize: 5, status: 'active' })
    ).resolves.toEqual({
      count: 1,
      data: [{ id: 'bundle-1', name: 'Kit' }],
    });

    expect(mocks.rpc).toHaveBeenCalledWith('list_inventory_bundles', {
      p_limit: 5,
      p_offset: 0,
      p_search: null,
      p_status: 'active',
      p_ws_id: 'ws-1',
    });
  });

  it('creates bundles through the atomic private upsert RPC', async () => {
    mocks.rpc.mockResolvedValue({
      data: { id: 'bundle-1', name: 'Kit' },
      error: null,
    });

    await expect(
      createBundle('ws-1', {
        components: [
          {
            productId: 'product-1',
            quantity: 2,
            unitId: 'unit-1',
            warehouseId: 'warehouse-1',
          },
        ],
        name: 'Kit',
        price: 5000,
        slug: 'kit',
      })
    ).resolves.toEqual({ id: 'bundle-1', name: 'Kit' });

    expect(mocks.rpc).toHaveBeenCalledWith(
      'upsert_inventory_bundle_with_components',
      expect.objectContaining({
        p_components: expect.any(Array),
        p_name: 'Kit',
        p_ws_id: 'ws-1',
      })
    );
  });

  it('maps invalid component scope errors for route-level 400 handling', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'INVALID_BUNDLE_COMPONENT_WORKSPACE_SCOPE' },
    });

    await expect(
      createBundle('ws-1', {
        name: 'Kit',
        price: 5000,
        slug: 'kit',
      })
    ).rejects.toBeInstanceOf(InvalidInventoryBundleComponentTargetError);
  });
});
