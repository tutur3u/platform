import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  getCachedPublicStorefront: vi.fn(),
  isInventoryEnabled: vi.fn(),
  resolveSessionAuthContext: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));

vi.mock('@/lib/inventory/commerce/public-storefront', () => ({
  getCachedPublicStorefront: (...args: unknown[]) =>
    mocks.getCachedPublicStorefront(...args),
}));

vi.mock('@/lib/inventory/access', () => ({
  isInventoryEnabled: (...args: unknown[]) => mocks.isInventoryEnabled(...args),
}));

vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: (...args: unknown[]) =>
    mocks.resolveSessionAuthContext(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: (...args: unknown[]) =>
    mocks.verifyWorkspaceMembershipType(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: { error: vi.fn() },
}));

describe('inventory public storefront route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isInventoryEnabled.mockResolvedValue(true);
    mocks.getCachedPublicStorefront.mockResolvedValue({
      bundles: [],
      listings: [],
      storefront: {
        id: 'storefront-1',
        visibility: 'public',
        wsId: 'ws-1',
      },
    });
  });

  it('serves public storefronts without session auth', async () => {
    const response = await GET(new Request('http://test.local'), {
      params: Promise.resolve({ slug: 'shop' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.getCachedPublicStorefront).toHaveBeenCalledWith('shop');
    expect(mocks.resolveSessionAuthContext).not.toHaveBeenCalled();
  });

  it('returns not found when the public storefront helper returns null', async () => {
    mocks.getCachedPublicStorefront.mockResolvedValue(null);

    const response = await GET(new Request('http://test.local'), {
      params: Promise.resolve({ slug: 'missing-shop' }),
    });

    expect(response.status).toBe(404);
    expect(mocks.isInventoryEnabled).not.toHaveBeenCalled();
  });

  it('requires workspace membership for private storefronts', async () => {
    mocks.getCachedPublicStorefront.mockResolvedValue({
      bundles: [],
      listings: [],
      storefront: {
        id: 'storefront-1',
        visibility: 'private',
        wsId: 'ws-1',
      },
    });
    mocks.resolveSessionAuthContext.mockResolvedValue({
      ok: true,
      supabase: {},
      user: { id: 'user-1' },
    });
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });

    const response = await GET(new Request('http://test.local'), {
      params: Promise.resolve({ slug: 'shop' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.resolveSessionAuthContext).toHaveBeenCalledWith(
      expect.any(Request),
      {
        allowAppSessionAuth: {
          targetApp: ['storefront', 'inventory'],
        },
      }
    );
    expect(mocks.verifyWorkspaceMembershipType).toHaveBeenCalledWith({
      supabase: {},
      userId: 'user-1',
      wsId: 'ws-1',
    });
  });
});
