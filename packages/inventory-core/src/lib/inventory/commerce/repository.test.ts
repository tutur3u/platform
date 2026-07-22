import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteStorefront,
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

vi.mock('./public-storefront', () => ({
  revalidatePublicStorefront: vi.fn(),
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

  it('hides rollout tombstones returned by a pre-migration storefront RPC', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          storefront: { id: 'storefront-1', name: 'Shop', slug: 'shop' },
          total_count: 2,
        },
        {
          storefront: {
            id: '0d364b69-51be-4405-bcb6-4cbdca3526a0',
            name: 'Removed shop',
            slug: 'deleted-0d364b69-51be-4405-bcb6-4cbdca3526a0',
          },
          total_count: 2,
        },
      ],
      error: null,
    });

    await expect(listStorefronts('ws-1')).resolves.toEqual({
      count: 1,
      data: [{ id: 'storefront-1', name: 'Shop', slug: 'shop' }],
    });
  });

  it('loads an admin storefront with mapped theme fields', async () => {
    const storefrontBuilder = {
      eq: vi.fn(),
      is: vi.fn(),
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
    storefrontBuilder.is.mockReturnValue(storefrontBuilder);

    const countBuilder = {
      eq: vi.fn().mockResolvedValue({ count: 3, error: null }),
      select: vi.fn(),
    };
    countBuilder.select.mockReturnValue(countBuilder);
    const sectionsBuilder = {
      eq: vi.fn(),
      order: vi.fn(),
      select: vi.fn(),
    };
    sectionsBuilder.select.mockReturnValue(sectionsBuilder);
    sectionsBuilder.eq.mockReturnValue(sectionsBuilder);
    sectionsBuilder.order
      .mockReturnValueOnce(sectionsBuilder)
      .mockResolvedValueOnce({ data: [], error: null });
    mocks.from
      .mockReturnValueOnce(storefrontBuilder)
      .mockReturnValueOnce(countBuilder)
      .mockReturnValueOnce(sectionsBuilder);

    await expect(getStorefront('ws-1', 'storefront-1')).resolves.toMatchObject({
      accentColor: '#123abc',
      checkoutMode: 'simulated',
      cornerStyle: 'soft',
      heroImageUrl: 'https://example.com/hero.jpg',
      id: 'storefront-1',
      layoutStyle: 'feature',
      listingsCount: 3,
      sections: [],
      showInventoryBadges: false,
      slug: 'preview-shop',
      surfaceStyle: 'glass',
      themePreset: 'editorial',
    });

    expect(mocks.from).toHaveBeenNthCalledWith(1, 'inventory_storefronts');
    expect(storefrontBuilder.eq).toHaveBeenCalledWith('id', 'storefront-1');
    expect(storefrontBuilder.eq).toHaveBeenCalledWith('ws_id', 'ws-1');
    expect(storefrontBuilder.is).toHaveBeenCalledWith('deleted_at', null);
    expect(mocks.from).toHaveBeenNthCalledWith(
      2,
      'inventory_storefront_listings'
    );
    expect(mocks.from).toHaveBeenNthCalledWith(
      3,
      'inventory_storefront_sections'
    );
    expect(countBuilder.select).toHaveBeenCalledWith('id', {
      count: 'exact',
      head: true,
    });
  });

  it('loads a storefront before deleted_at reaches the environment', async () => {
    const missingColumnBuilder = {
      eq: vi.fn(),
      is: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: '42703',
          message: 'column inventory_storefronts.deleted_at does not exist',
        },
      }),
      select: vi.fn(),
    };
    missingColumnBuilder.select.mockReturnValue(missingColumnBuilder);
    missingColumnBuilder.eq.mockReturnValue(missingColumnBuilder);
    missingColumnBuilder.is.mockReturnValue(missingColumnBuilder);

    const fallbackStorefrontBuilder = {
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          checkout_mode: 'simulated',
          currency: 'USD',
          id: 'storefront-1',
          name: 'Preview Shop',
          slug: 'preview-shop',
          status: 'published',
          visibility: 'public',
          ws_id: 'ws-1',
        },
        error: null,
      }),
      neq: vi.fn(),
      select: vi.fn(),
    };
    fallbackStorefrontBuilder.select.mockReturnValue(fallbackStorefrontBuilder);
    fallbackStorefrontBuilder.eq.mockReturnValue(fallbackStorefrontBuilder);
    fallbackStorefrontBuilder.neq.mockReturnValue(fallbackStorefrontBuilder);

    const countBuilder = {
      eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
      select: vi.fn(),
    };
    countBuilder.select.mockReturnValue(countBuilder);
    const sectionsBuilder = {
      eq: vi.fn(),
      order: vi.fn(),
      select: vi.fn(),
    };
    sectionsBuilder.select.mockReturnValue(sectionsBuilder);
    sectionsBuilder.eq.mockReturnValue(sectionsBuilder);
    sectionsBuilder.order
      .mockReturnValueOnce(sectionsBuilder)
      .mockResolvedValueOnce({ data: [], error: null });
    mocks.from
      .mockReturnValueOnce(missingColumnBuilder)
      .mockReturnValueOnce(fallbackStorefrontBuilder)
      .mockReturnValueOnce(countBuilder)
      .mockReturnValueOnce(sectionsBuilder);

    await expect(getStorefront('ws-1', 'storefront-1')).resolves.toMatchObject({
      id: 'storefront-1',
      slug: 'preview-shop',
    });

    expect(fallbackStorefrontBuilder.neq).toHaveBeenCalledWith(
      'slug',
      'deleted-storefront-1'
    );
  });

  it('soft deletes storefronts while preserving referenced checkout history', async () => {
    const sourceBuilder = {
      eq: vi.fn(),
      is: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: 'storefront-1',
          metadata: { campaign: 'summer' },
          slug: 'preview-shop',
        },
        error: null,
      }),
      select: vi.fn(),
    };
    sourceBuilder.select.mockReturnValue(sourceBuilder);
    sourceBuilder.eq.mockReturnValue(sourceBuilder);
    sourceBuilder.is.mockReturnValue(sourceBuilder);

    const updateBuilder = {
      eq: vi.fn(),
      is: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'storefront-1' },
        error: null,
      }),
      select: vi.fn(),
      update: vi.fn(),
    };
    updateBuilder.update.mockReturnValue(updateBuilder);
    updateBuilder.eq.mockReturnValue(updateBuilder);
    updateBuilder.is.mockReturnValue(updateBuilder);
    updateBuilder.select.mockReturnValue(updateBuilder);

    mocks.from
      .mockReturnValueOnce(sourceBuilder)
      .mockReturnValueOnce(updateBuilder);

    await expect(deleteStorefront('ws-1', 'storefront-1')).resolves.toBe(true);

    expect(sourceBuilder.select).toHaveBeenCalledWith('id, slug, metadata');
    expect(updateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        deleted_at: expect.any(String),
        metadata: expect.objectContaining({
          campaign: 'summer',
          deletedAt: expect.any(String),
          deletedSlug: 'preview-shop',
        }),
        slug: 'deleted-storefront-1',
        status: 'archived',
        updated_at: expect.any(String),
      })
    );
    expect(updateBuilder.is).toHaveBeenCalledWith('deleted_at', null);
  });

  it('falls back to a metadata tombstone when deleted_at is not deployed yet', async () => {
    const missingColumnBuilder = {
      eq: vi.fn(),
      is: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: '42703',
          message: 'column inventory_storefronts.deleted_at does not exist',
        },
      }),
      select: vi.fn(),
    };
    missingColumnBuilder.select.mockReturnValue(missingColumnBuilder);
    missingColumnBuilder.eq.mockReturnValue(missingColumnBuilder);
    missingColumnBuilder.is.mockReturnValue(missingColumnBuilder);

    const fallbackSourceBuilder = {
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: 'storefront-1',
          metadata: { campaign: 'summer' },
          slug: 'preview-shop',
        },
        error: null,
      }),
      neq: vi.fn(),
      select: vi.fn(),
    };
    fallbackSourceBuilder.select.mockReturnValue(fallbackSourceBuilder);
    fallbackSourceBuilder.eq.mockReturnValue(fallbackSourceBuilder);
    fallbackSourceBuilder.neq.mockReturnValue(fallbackSourceBuilder);

    const fallbackUpdateBuilder = {
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'storefront-1' },
        error: null,
      }),
      select: vi.fn(),
      update: vi.fn(),
    };
    fallbackUpdateBuilder.update.mockReturnValue(fallbackUpdateBuilder);
    fallbackUpdateBuilder.eq.mockReturnValue(fallbackUpdateBuilder);
    fallbackUpdateBuilder.select.mockReturnValue(fallbackUpdateBuilder);

    mocks.from
      .mockReturnValueOnce(missingColumnBuilder)
      .mockReturnValueOnce(fallbackSourceBuilder)
      .mockReturnValueOnce(fallbackUpdateBuilder);

    await expect(deleteStorefront('ws-1', 'storefront-1')).resolves.toBe(true);

    expect(fallbackSourceBuilder.neq).toHaveBeenCalledWith(
      'slug',
      'deleted-storefront-1'
    );
    expect(fallbackUpdateBuilder.update).toHaveBeenCalledWith(
      expect.not.objectContaining({ deleted_at: expect.anything() })
    );
    expect(fallbackUpdateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          campaign: 'summer',
          deletedAt: expect.any(String),
          deletedSlug: 'preview-shop',
        }),
        slug: 'deleted-storefront-1',
        status: 'archived',
      })
    );
    expect(fallbackUpdateBuilder.eq).toHaveBeenCalledWith(
      'slug',
      'preview-shop'
    );
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
