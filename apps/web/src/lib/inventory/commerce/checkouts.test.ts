import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCheckoutByPublicToken } from './checkouts';

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
});
