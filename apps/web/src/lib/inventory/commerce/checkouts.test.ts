import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCheckoutByPublicToken,
  getCheckoutStorefrontAccessByPublicToken,
  listCheckouts,
  releaseCheckout,
} from './checkouts';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => {
  const from = vi.fn();
  const rpc = vi.fn();
  const schema = vi.fn(() => ({ from, rpc }));
  return {
    createAdminClient: vi.fn(),
    from,
    rpc,
    schema,
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => mocks.createAdminClient(),
}));

describe('getCheckoutByPublicToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue({ schema: mocks.schema });
  });

  it('loads public checkout data through the private RPC', async () => {
    const checkout = {
      id: 'checkout-1',
      lines: [],
      publicToken: 'public-token',
      status: 'reserved',
      wsId: 'ws-1',
    };
    mocks.rpc.mockResolvedValue({ data: checkout, error: null });

    await expect(getCheckoutByPublicToken('public-token')).resolves.toBe(
      checkout
    );

    expect(mocks.schema).toHaveBeenCalledWith('private');
    expect(mocks.rpc).toHaveBeenCalledWith(
      'get_inventory_checkout_by_public_token',
      {
        p_public_token: 'public-token',
      }
    );
  });

  it('returns null when the private RPC returns no checkout', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });

    await expect(getCheckoutByPublicToken('missing')).resolves.toBeNull();
  });

  it('throws private RPC errors for route-level logging', async () => {
    const error = { message: 'schema cache is stale' };
    mocks.rpc.mockResolvedValue({ data: null, error });

    await expect(getCheckoutByPublicToken('public-token')).rejects.toBe(error);
  });

  it('loads checkout storefront access metadata from private tables', async () => {
    const checkoutMaybeSingle = vi.fn().mockResolvedValue({
      data: { storefront_id: 'storefront-1' },
      error: null,
    });
    const checkoutEq = vi.fn(() => ({ maybeSingle: checkoutMaybeSingle }));
    const checkoutSelect = vi.fn(() => ({ eq: checkoutEq }));
    const storefrontMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'storefront-1',
        slug: 'shop',
        visibility: 'private',
        ws_id: 'ws-1',
      },
      error: null,
    });
    const storefrontEq = vi.fn(() => ({ maybeSingle: storefrontMaybeSingle }));
    const storefrontSelect = vi.fn(() => ({ eq: storefrontEq }));
    mocks.from
      .mockReturnValueOnce({ select: checkoutSelect })
      .mockReturnValueOnce({ select: storefrontSelect });

    await expect(
      getCheckoutStorefrontAccessByPublicToken('public-token')
    ).resolves.toEqual({
      storefrontId: 'storefront-1',
      storefrontSlug: 'shop',
      visibility: 'private',
      wsId: 'ws-1',
    });

    expect(mocks.from).toHaveBeenNthCalledWith(
      1,
      'inventory_checkout_sessions'
    );
    expect(mocks.from).toHaveBeenNthCalledWith(2, 'inventory_storefronts');
    expect(checkoutEq).toHaveBeenCalledWith('public_token', 'public-token');
    expect(storefrontEq).toHaveBeenCalledWith('id', 'storefront-1');
  });

  it('lists checkouts through the private checkout RPC', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          checkout: { id: 'checkout-1', publicToken: 'public-token' },
          total_count: 1,
        },
      ],
      error: null,
    });

    await expect(
      listCheckouts('ws-1', { pageSize: 10, q: 'buyer', status: 'reserved' })
    ).resolves.toEqual({
      count: 1,
      data: [{ id: 'checkout-1', publicToken: 'public-token' }],
    });

    expect(mocks.rpc).toHaveBeenCalledWith('list_inventory_checkouts', {
      p_limit: 10,
      p_offset: 0,
      p_search: 'buyer',
      p_status: 'reserved',
      p_ws_id: 'ws-1',
    });
  });

  it('releases a workspace checkout through the private release RPC', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { public_token: 'public-token' },
      error: null,
    });
    const eq = vi.fn(() => ({ eq, maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    mocks.from.mockReturnValue({ select });
    mocks.rpc
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: { id: 'checkout-1', publicToken: 'public-token' },
        error: null,
      });

    await expect(releaseCheckout('ws-1', 'checkout-1')).resolves.toEqual({
      id: 'checkout-1',
      publicToken: 'public-token',
    });

    expect(mocks.from).toHaveBeenCalledWith('inventory_checkout_sessions');
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      1,
      'release_inventory_checkout_session',
      {
        p_checkout_id: 'checkout-1',
      }
    );
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      2,
      'get_inventory_checkout_by_public_token',
      {
        p_public_token: 'public-token',
      }
    );
  });
});
