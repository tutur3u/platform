import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCachedPublicStorefront,
  getPublicStorefront,
  publicStorefrontTag,
  revalidatePublicStorefront,
} from './public-storefront';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  const schema = vi.fn(() => ({ rpc }));
  return {
    createAdminClient: vi.fn(),
    cacheLife: vi.fn(),
    cacheTag: vi.fn(),
    revalidateTag: vi.fn(),
    rpc,
    schema,
  };
});

vi.mock('next/cache', () => ({
  cacheLife: (...args: unknown[]) => mocks.cacheLife(...args),
  cacheTag: (...args: unknown[]) => mocks.cacheTag(...args),
  revalidateTag: (...args: unknown[]) => mocks.revalidateTag(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: unknown[]) => mocks.createAdminClient(...args),
}));

describe('getPublicStorefront', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue({ schema: mocks.schema });
  });

  it('loads public storefront data through the private RPC', async () => {
    const payload = {
      bundles: [],
      listings: [],
      storefront: {
        cornerStyle: 'soft',
        layoutStyle: 'feature',
        showInventoryBadges: false,
        slug: 'demo',
        surfaceStyle: 'glass',
        themePreset: 'boutique',
        visibility: 'public',
        wsId: 'ws-1',
      },
    };
    mocks.rpc.mockResolvedValue({ data: payload, error: null });

    await expect(getPublicStorefront('demo')).resolves.toBe(payload);

    expect(mocks.schema).toHaveBeenCalledWith('private');
    expect(mocks.rpc).toHaveBeenCalledWith('get_public_inventory_storefront', {
      p_storefront_slug: 'demo',
    });
  });

  it('uses the uploaded bundle image when its storefront listing has no override', async () => {
    const payload = {
      bundles: [
        {
          id: 'bundle-1',
          imageUrl: 'https://assets.example.com/bundle.webp',
        },
      ],
      listings: [
        {
          bundleId: 'bundle-1',
          id: 'listing-1',
          imageUrl: null,
          listingType: 'bundle',
        },
        {
          bundleId: 'bundle-1',
          id: 'listing-2',
          imageUrl: 'https://assets.example.com/listing-override.webp',
          listingType: 'bundle',
        },
      ],
      storefront: { slug: 'demo' },
    };
    mocks.rpc.mockResolvedValue({ data: payload, error: null });

    await expect(getPublicStorefront('demo')).resolves.toMatchObject({
      listings: [
        {
          imageUrl: 'https://assets.example.com/bundle.webp',
        },
        {
          imageUrl: 'https://assets.example.com/listing-override.webp',
        },
      ],
    });
  });

  it('uses the event-driven storefront cache profile and tag', async () => {
    const payload = { listings: [], storefront: { slug: 'demo' } };
    mocks.rpc.mockResolvedValue({ data: payload, error: null });

    await expect(getCachedPublicStorefront('demo')).resolves.toBe(payload);

    expect(mocks.createAdminClient).toHaveBeenCalledWith({ noCookie: true });
    expect(mocks.cacheLife).toHaveBeenCalledWith({
      expire: 315_360_000,
      revalidate: 31_536_000,
      stale: 300,
    });
    expect(mocks.cacheTag).toHaveBeenCalledWith(publicStorefrontTag('demo'));
  });

  it('expires the tag immediately after a storefront-affecting write', () => {
    revalidatePublicStorefront('demo');

    expect(mocks.revalidateTag).toHaveBeenCalledWith(
      publicStorefrontTag('demo'),
      { expire: 0 }
    );
  });

  it('returns null when the private RPC returns no storefront', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });

    await expect(getPublicStorefront('missing')).resolves.toBeNull();
  });

  it('throws private RPC errors for route-level logging', async () => {
    const error = { message: 'schema cache is stale' };
    mocks.rpc.mockResolvedValue({ data: null, error });

    await expect(getPublicStorefront('demo')).rejects.toBe(error);
  });
});
