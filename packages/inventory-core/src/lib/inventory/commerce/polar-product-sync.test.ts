import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InventoryPolarWorkspaceMismatchError } from './polar';
import { applyPolarProductToInventory } from './polar-product-sync';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => {
  const secondEq = vi.fn();
  const firstEq = vi.fn(() => ({ eq: secondEq }));
  const update = vi.fn(() => ({ eq: firstEq }));
  const from = vi.fn(() => ({ update }));
  const schema = vi.fn(() => ({ from }));

  return {
    createAdminClient: vi.fn(),
    firstEq,
    from,
    schema,
    secondEq,
    update,
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => mocks.createAdminClient(),
}));

vi.mock('../../infrastructure/log-drain', () => ({
  serverLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('applyPolarProductToInventory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue({ schema: mocks.schema });
    mocks.secondEq.mockResolvedValue({ error: null });
  });

  it('rejects cross-workspace product metadata before any Supabase mutation', async () => {
    await expect(
      applyPolarProductToInventory(
        {
          id: 'polar-product-1',
          metadata: {
            kind: 'inventory_listing',
            rowId: 'listing-1',
            wsId: 'victim-ws',
          },
          prices: [],
        } as never,
        'attacker-ws'
      )
    ).rejects.toBeInstanceOf(InventoryPolarWorkspaceMismatchError);

    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('updates matching product metadata with workspace-scoped predicates', async () => {
    await expect(
      applyPolarProductToInventory(
        {
          description: 'Updated listing',
          id: 'polar-product-1',
          metadata: {
            kind: 'inventory_listing',
            rowId: 'listing-1',
            wsId: 'ws-1',
          },
          name: 'Polar listing',
          prices: [{ amountType: 'fixed', id: 'price-1', priceAmount: 1500 }],
        } as never,
        'ws-1'
      )
    ).resolves.toBe(true);

    expect(mocks.from).toHaveBeenCalledWith('inventory_storefront_listings');
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Updated listing',
        polar_price_id: 'price-1',
        polar_product_id: 'polar-product-1',
        polar_sync_status: 'synced',
        price: 1500,
        title: 'Polar listing',
      })
    );
    expect(mocks.firstEq).toHaveBeenCalledWith('id', 'listing-1');
    expect(mocks.secondEq).toHaveBeenCalledWith('ws_id', 'ws-1');
  });
});
