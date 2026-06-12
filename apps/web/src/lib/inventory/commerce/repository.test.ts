import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getStorefront,
  listStorefrontListings,
  listStorefronts,
} from './repository';

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

  it('loads an admin storefront with mapped theme fields', async () => {
    const storefrontBuilder = {
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          accent_color: '#123abc',
          corner_style: 'soft',
          created_at: '2026-06-12T00:00:00.000Z',
          currency: 'USD',
          checkout_mode: 'simulated',
          description: 'Preview copy',
          hero_image_url: 'https://example.com/hero.jpg',
          id: 'storefront-1',
          layout_style: 'feature',
          name: 'Preview Shop',
          show_inventory_badges: false,
          slug: 'preview-shop',
          status: 'published',
          surface_style: 'glass',
          theme_preset: 'editorial',
          updated_at: '2026-06-12T00:00:00.000Z',
          visibility: 'public',
          ws_id: 'ws-1',
        },
        error: null,
      }),
      select: vi.fn(),
    };
    storefrontBuilder.select.mockReturnValue(storefrontBuilder);
    storefrontBuilder.eq.mockReturnValue(storefrontBuilder);

    const countBuilder = {
      eq: vi.fn().mockResolvedValue({ count: 3, error: null }),
      select: vi.fn(),
    };
    countBuilder.select.mockReturnValue(countBuilder);
    mocks.from
      .mockReturnValueOnce(storefrontBuilder)
      .mockReturnValueOnce(countBuilder);

    await expect(getStorefront('ws-1', 'storefront-1')).resolves.toMatchObject({
      accentColor: '#123abc',
      checkoutMode: 'simulated',
      cornerStyle: 'soft',
      heroImageUrl: 'https://example.com/hero.jpg',
      id: 'storefront-1',
      layoutStyle: 'feature',
      listingsCount: 3,
      showInventoryBadges: false,
      slug: 'preview-shop',
      surfaceStyle: 'glass',
      themePreset: 'editorial',
    });

    expect(mocks.from).toHaveBeenNthCalledWith(1, 'inventory_storefronts');
    expect(storefrontBuilder.eq).toHaveBeenCalledWith('id', 'storefront-1');
    expect(storefrontBuilder.eq).toHaveBeenCalledWith('ws_id', 'ws-1');
    expect(mocks.from).toHaveBeenNthCalledWith(
      2,
      'inventory_storefront_listings'
    );
    expect(countBuilder.select).toHaveBeenCalledWith('id', {
      count: 'exact',
      head: true,
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
