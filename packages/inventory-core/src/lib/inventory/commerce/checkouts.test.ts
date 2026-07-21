import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  expireCheckoutReservations,
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
    safelyRevalidateStorefrontByCheckoutId: vi.fn(),
    safelyRevalidateWorkspaceStorefronts: vi.fn(),
  };
});

vi.mock('./public-storefront', () => ({
  safelyRevalidateStorefrontByCheckoutId: (...args: unknown[]) =>
    mocks.safelyRevalidateStorefrontByCheckoutId(...args),
  safelyRevalidateWorkspaceStorefronts: (...args: unknown[]) =>
    mocks.safelyRevalidateWorkspaceStorefronts(...args),
}));

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
    mocks.rpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({
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

    expect(mocks.rpc).toHaveBeenNthCalledWith(
      1,
      'expire_inventory_checkout_sessions',
      expect.objectContaining({
        p_limit: 500,
        p_ws_id: 'ws-1',
      })
    );
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'list_inventory_checkouts', {
      p_limit: 10,
      p_offset: 0,
      p_search: 'buyer',
      p_status: 'reserved',
      p_ws_id: 'ws-1',
    });
  });

  it('materializes expired checkout and reservation states in bounded batches', async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ checkout_id: 'checkout-1', ws_id: 'ws-1' }],
      error: null,
    });
    const now = new Date('2026-07-13T08:00:00.000Z');

    await expect(
      expireCheckoutReservations({ limit: 99_999, now, wsId: 'ws-1' })
    ).resolves.toEqual([{ checkout_id: 'checkout-1', ws_id: 'ws-1' }]);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'expire_inventory_checkout_sessions',
      {
        p_limit: 5000,
        p_now: now.toISOString(),
        p_ws_id: 'ws-1',
      }
    );
    expect(mocks.safelyRevalidateWorkspaceStorefronts).toHaveBeenCalledWith(
      'ws-1'
    );
  });

  it('lazily expires a stale public checkout before returning it', async () => {
    const staleCheckout = {
      expiresAt: '2026-07-13T07:00:00.000Z',
      id: 'checkout-1',
      lines: [],
      publicToken: 'public-token',
      status: 'reserved',
      wsId: 'ws-1',
    };
    mocks.rpc
      .mockResolvedValueOnce({ data: staleCheckout, error: null })
      .mockResolvedValueOnce({
        data: [{ checkout_id: 'checkout-1', ws_id: 'ws-1' }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: { ...staleCheckout, status: 'expired' },
        error: null,
      });

    await expect(getCheckoutByPublicToken('public-token')).resolves.toEqual({
      ...staleCheckout,
      status: 'expired',
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      2,
      'expire_inventory_checkout_sessions',
      expect.objectContaining({ p_ws_id: 'ws-1' })
    );
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      3,
      'get_inventory_checkout_by_public_token',
      { p_public_token: 'public-token' }
    );
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
        p_ws_id: 'ws-1',
      }
    );
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      2,
      'get_inventory_checkout_by_public_token',
      {
        p_public_token: 'public-token',
      }
    );
    expect(mocks.safelyRevalidateStorefrontByCheckoutId).toHaveBeenCalledWith(
      'ws-1',
      'checkout-1'
    );
  });
});
