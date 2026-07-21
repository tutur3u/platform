import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InventoryPolarWorkspaceMismatchError,
  syncInventoryPolarCheckout,
  syncInventoryPolarOrder,
} from './polar';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => {
  const secondEq = vi.fn();
  const firstEq = vi.fn(() => ({ eq: secondEq }));
  const update = vi.fn(() => ({ eq: firstEq }));
  const from = vi.fn(() => ({ update }));
  const rpc = vi.fn();
  const schema = vi.fn(() => ({ from, rpc }));

  return {
    createAdminClient: vi.fn(),
    firstEq,
    from,
    recordInventorySaleFinanceTransaction: vi.fn(),
    revalidatePublicStorefront: vi.fn(),
    rpc,
    schema,
    secondEq,
    update,
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => mocks.createAdminClient(),
}));

vi.mock('./finance', () => ({
  recordInventorySaleFinanceTransaction: (...args: unknown[]) =>
    mocks.recordInventorySaleFinanceTransaction(...args),
}));

vi.mock('./public-storefront', () => ({
  revalidatePublicStorefront: (...args: unknown[]) =>
    mocks.revalidatePublicStorefront(...args),
}));

describe('inventory Polar order sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue({ schema: mocks.schema });
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.secondEq.mockResolvedValue({ error: null });
  });

  it('rejects cross-workspace order metadata before any Supabase mutation', async () => {
    await expect(
      syncInventoryPolarOrder(
        {
          id: 'order-1',
          metadata: {
            checkoutId: 'checkout-1',
            kind: 'inventory_checkout',
            wsId: 'victim-ws',
          },
          status: 'paid',
        } as never,
        'attacker-ws'
      )
    ).rejects.toBeInstanceOf(InventoryPolarWorkspaceMismatchError);

    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.recordInventorySaleFinanceTransaction).not.toHaveBeenCalled();
  });

  it('completes matching paid orders with a workspace-scoped RPC call', async () => {
    await expect(
      syncInventoryPolarOrder(
        {
          id: 'order-1',
          metadata: {
            checkoutId: 'checkout-1',
            kind: 'inventory_checkout',
            storefrontSlug: 'shop',
            wsId: 'ws-1',
          },
          status: 'paid',
        } as never,
        'ws-1'
      )
    ).resolves.toBe(true);

    expect(mocks.from).toHaveBeenCalledWith('inventory_checkout_sessions');
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        polar_order_id: 'order-1',
        polar_status: 'paid',
      })
    );
    expect(mocks.firstEq).toHaveBeenCalledWith('id', 'checkout-1');
    expect(mocks.secondEq).toHaveBeenCalledWith('ws_id', 'ws-1');
    expect(mocks.rpc).toHaveBeenCalledWith(
      'complete_inventory_checkout_session_payment',
      {
        p_checkout_id: 'checkout-1',
        p_polar_order_id: 'order-1',
        p_ws_id: 'ws-1',
      }
    );
    expect(mocks.recordInventorySaleFinanceTransaction).toHaveBeenCalledWith({
      checkoutId: 'checkout-1',
    });
    expect(mocks.revalidatePublicStorefront).toHaveBeenCalledWith('shop');
  });
});

describe('inventory Polar checkout sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue({ schema: mocks.schema });
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.secondEq.mockResolvedValue({ error: null });
  });

  it('releases failed matching checkouts with a workspace-scoped RPC call', async () => {
    await expect(
      syncInventoryPolarCheckout(
        {
          id: 'polar-checkout-1',
          metadata: {
            checkoutId: 'checkout-1',
            kind: 'inventory_checkout',
            wsId: 'ws-1',
          },
          status: 'failed',
        } as never,
        'ws-1'
      )
    ).resolves.toBe(true);

    expect(mocks.rpc).toHaveBeenCalledWith(
      'release_inventory_checkout_session',
      {
        p_checkout_id: 'checkout-1',
        p_ws_id: 'ws-1',
      }
    );
  });
});
