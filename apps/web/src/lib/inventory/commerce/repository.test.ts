import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listStorefrontListings, listStorefronts } from './repository';

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

describe('inventory commerce repository RPC reads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue({ schema: mocks.schema });
  });

  it('lists storefronts through the private storefront RPC', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          storefront: { id: 'storefront-1', name: 'Shop' },
          total_count: 1,
        },
      ],
      error: null,
    });

    await expect(
      listStorefronts('ws-1', {
        page: 2,
        pageSize: 10,
        q: 'shop',
        status: 'published',
      })
    ).resolves.toEqual({
      count: 1,
      data: [{ id: 'storefront-1', name: 'Shop' }],
    });

    expect(mocks.schema).toHaveBeenCalledWith('private');
    expect(mocks.rpc).toHaveBeenCalledWith('list_inventory_storefronts', {
      p_limit: 10,
      p_offset: 10,
      p_search: 'shop',
      p_status: 'published',
      p_ws_id: 'ws-1',
    });
  });

  it('lists storefront listings through the private listings RPC', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          listing: { id: 'listing-1', title: 'Coffee' },
          total_count: 1,
        },
      ],
      error: null,
    });

    await expect(
      listStorefrontListings('ws-1', 'storefront-1', { status: 'published' })
    ).resolves.toEqual({
      count: 1,
      data: [{ id: 'listing-1', title: 'Coffee' }],
    });

    expect(mocks.rpc).toHaveBeenCalledWith(
      'list_inventory_storefront_listings',
      {
        p_status: 'published',
        p_storefront_id: 'storefront-1',
        p_ws_id: 'ws-1',
      }
    );
  });
});
