import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  bulk: vi.fn(),
  getStorefront: vi.fn(),
}));
vi.mock('@tuturuuu/inventory-core/commerce/auth', () => ({
  authorizeInventoryWorkspace: (...args: unknown[]) => mocks.authorize(...args),
}));
vi.mock('@tuturuuu/inventory-core/commerce/repository', () => ({
  bulkCreateStorefrontListingsFromStock: (...args: unknown[]) =>
    mocks.bulk(...args),
  getStorefront: (...args: unknown[]) => mocks.getStorefront(...args),
}));
function permissions(granted: string[]) {
  return {
    containsPermission: vi.fn((permission: string) =>
      granted.includes(permission)
    ),
  };
}

describe('storefront listing bulk import route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({
      ok: true,
      value: {
        permissions: permissions(['manage_inventory_catalog']),
        wsId: 'ws-real',
      },
    });
    mocks.getStorefront.mockResolvedValue({ currency: 'VND', id: 'store-1' });
    mocks.bulk.mockResolvedValue({
      created: 8,
      eligible: 10,
      skippedExisting: 2,
      skippedWithoutStock: 3,
    });
  });
  it('uses the storefront currency and returns the safe import summary', async () => {
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/import', { method: 'POST' }),
      { params: Promise.resolve({ storefrontId: 'store-1', wsId: 'alias' }) }
    );
    expect(response.status).toBe(201);
    expect(mocks.bulk).toHaveBeenCalledWith('ws-real', 'store-1', 'VND');
    await expect(response.json()).resolves.toMatchObject({
      data: { created: 8, skippedExisting: 2 },
    });
  });
});
