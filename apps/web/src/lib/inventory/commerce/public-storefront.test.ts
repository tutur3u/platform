import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPublicStorefront } from './public-storefront';

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

describe('getPublicStorefront', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue({ schema: mocks.schema });
  });

  it('loads public storefront data through the private RPC', async () => {
    const payload = {
      bundles: [],
      listings: [],
      storefront: { slug: 'demo', visibility: 'public', wsId: 'ws-1' },
    };
    mocks.rpc.mockResolvedValue({ data: payload, error: null });

    await expect(getPublicStorefront('demo')).resolves.toBe(payload);

    expect(mocks.schema).toHaveBeenCalledWith('private');
    expect(mocks.rpc).toHaveBeenCalledWith('get_public_inventory_storefront', {
      p_storefront_slug: 'demo',
    });
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
