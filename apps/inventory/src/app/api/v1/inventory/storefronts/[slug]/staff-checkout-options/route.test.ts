import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  authorizeSquareCheckoutStaff: vi.fn(),
  createAdminClient: vi.fn(),
  getPublicStorefront: vi.fn(),
  getWorkspaceConfig: vi.fn(),
  isInventoryEnabled: vi.fn(),
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(),
}));

vi.mock('@tuturuuu/inventory-core/access', () => ({
  isInventoryEnabled: (...args: unknown[]) => mocks.isInventoryEnabled(...args),
}));
vi.mock('@tuturuuu/inventory-core/commerce/public-storefront', () => ({
  getPublicStorefront: (...args: unknown[]) =>
    mocks.getPublicStorefront(...args),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => mocks.createAdminClient(),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getWorkspaceConfig: (...args: unknown[]) => mocks.getWorkspaceConfig(...args),
}));
vi.mock('@/lib/square-checkout-access', () => ({
  authorizeSquareCheckoutStaff: (...args: unknown[]) =>
    mocks.authorizeSquareCheckoutStaff(...args),
}));

function query(data: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order']) {
    chain[method] = vi.fn(() => chain);
  }
  // biome-ignore lint/suspicious/noThenProperty: Supabase query test double.
  chain.then = (resolve: (result: unknown) => unknown) =>
    resolve({ data, error: null });
  return chain;
}

describe('staff checkout options route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPublicStorefront.mockResolvedValue({
      storefront: {
        checkoutMode: 'polar',
        currency: 'USD',
        wsId: 'ws-1',
      },
    });
    mocks.isInventoryEnabled.mockResolvedValue(true);
    mocks.authorizeSquareCheckoutStaff.mockResolvedValue({ ok: true });
    mocks.getWorkspaceConfig.mockImplementation((_wsId: string, key: string) =>
      Promise.resolve(
        key === 'inventory_default_revenue_wallet_id'
          ? 'wallet-1'
          : 'category-1'
      )
    );
    mocks.createAdminClient.mockResolvedValue({
      from: () => query([{ id: 'category-1', name: 'Sales' }]),
      schema: () => ({
        from: () => query([{ id: 'wallet-1', name: 'Cash drawer' }]),
      }),
    });
  });

  it('returns protected compatible Finance defaults to POS staff', async () => {
    const response = await GET(new Request('http://test.local'), {
      params: Promise.resolve({ slug: 'shop' }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      cash: {
        categories: [{ id: 'category-1', name: 'Sales' }],
        defaultCategoryId: 'category-1',
        defaultWalletId: 'wallet-1',
        wallets: [{ id: 'wallet-1', name: 'Cash drawer' }],
      },
      configuredCheckoutMode: 'polar',
      paymentMethods: ['configured', 'cash'],
      staffAuthorized: true,
    });
  });

  it('does not expose Finance configuration to anonymous buyers', async () => {
    mocks.authorizeSquareCheckoutStaff.mockResolvedValue({
      ok: false,
      response: Response.json({ message: 'Unauthorized' }, { status: 401 }),
    });

    const response = await GET(new Request('http://test.local'), {
      params: Promise.resolve({ slug: 'shop' }),
    });

    expect(response.status).toBe(401);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('does not silently enable cash for simulated storefronts', async () => {
    mocks.getPublicStorefront.mockResolvedValue({
      storefront: {
        checkoutMode: 'simulated',
        currency: 'USD',
        wsId: 'ws-1',
      },
    });

    const response = await GET(new Request('http://test.local'), {
      params: Promise.resolve({ slug: 'shop' }),
    });

    expect((await response.json()).paymentMethods).toEqual([]);
  });
});
