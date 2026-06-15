import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeInventoryWorkspace: vi.fn(),
  createAdminClient: vi.fn(),
  getInventoryDashboardSnapshot: vi.fn(),
  getInventoryLowStockProducts: vi.fn(),
  getInventoryOverviewMetrics: vi.fn(),
  isInventoryRealtimeEnabled: vi.fn(),
  serverError: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => mocks.createAdminClient(),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: Parameters<typeof mocks.serverError>) =>
      mocks.serverError(...args),
  },
}));

vi.mock('@/lib/inventory/commerce/auth', () => ({
  authorizeInventoryWorkspace: (
    ...args: Parameters<typeof mocks.authorizeInventoryWorkspace>
  ) => mocks.authorizeInventoryWorkspace(...args),
}));

vi.mock('@/lib/inventory/product-rpc', () => ({
  getInventoryDashboardSnapshot: (
    ...args: Parameters<typeof mocks.getInventoryDashboardSnapshot>
  ) => mocks.getInventoryDashboardSnapshot(...args),
  getInventoryLowStockProducts: (
    ...args: Parameters<typeof mocks.getInventoryLowStockProducts>
  ) => mocks.getInventoryLowStockProducts(...args),
  getInventoryOverviewMetrics: (
    ...args: Parameters<typeof mocks.getInventoryOverviewMetrics>
  ) => mocks.getInventoryOverviewMetrics(...args),
}));

vi.mock('@/lib/inventory/realtime', () => ({
  isInventoryRealtimeEnabled: (
    ...args: Parameters<typeof mocks.isInventoryRealtimeEnabled>
  ) => mocks.isInventoryRealtimeEnabled(...args),
}));

describe('inventory overview route', () => {
  const withPermissions = (granted: string[]) => ({
    containsPermission: vi.fn((permission: string) =>
      granted.includes(permission)
    ),
  });

  const dashboard = {
    actions: [
      {
        kind: 'resolve_low_stock',
        priority: 5,
        view: 'stock',
      },
    ],
    analytics: {
      categoryMix: [{ label: 'Prints', quantity: 2, revenue: 40 }],
      ownerMix: [{ label: 'Owner', quantity: 2, revenue: 40 }],
      revenueTrend: [{ date: '2026-06-13', quantity: 2, revenue: 40 }],
    },
    costing: {
      averageMarginPercentage: 54,
      bestScenario: null,
      lowestBreakEvenQuantity: 2,
      profilesCount: 1,
      scenariosCount: 2,
      weakestScenario: null,
    },
    counts: {
      activeBundles: 0,
      batches: 0,
      bundles: 0,
      categories: 1,
      checkouts: 1,
      costingProfiles: 1,
      listings: 1,
      lowStock: 1,
      manufacturers: 1,
      owners: 1,
      polarReady: 0,
      products: 1,
      publishedListings: 1,
      publishedStorefronts: 1,
      reservedCheckouts: 1,
      sales: 1,
      simulatedCheckoutStorefronts: 1,
      staleCheckouts: 1,
      stockRows: 1,
      storefronts: 1,
      suppliers: 1,
      units: 1,
      warehouses: 1,
    },
    readiness: [
      {
        completed: 2,
        key: 'products',
        score: 67,
        total: 3,
        view: 'catalog',
      },
    ],
    risks: [
      {
        detail: 'Warehouse · 1/5 pcs',
        entityId: 'product-1',
        kind: 'low_stock',
        label: 'Acrylic Keychain',
        metric: 1,
        severity: 'high',
        view: 'stock',
      },
      {
        detail: '2026-06-13T00:00:00.000Z',
        entityId: 'checkout-1',
        kind: 'stale_checkout',
        label: 'Buyer',
        metric: 4000,
        severity: 'medium',
        view: 'commerce',
      },
    ],
    storefrontHealth: {
      disabledCheckout: 0,
      polarCheckout: 0,
      published: 1,
      simulatedCheckout: 1,
      themeGaps: 0,
      withoutPublishedListings: 0,
    },
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue({});
    mocks.getInventoryDashboardSnapshot.mockResolvedValue(dashboard);
    mocks.getInventoryLowStockProducts.mockResolvedValue([]);
    mocks.getInventoryOverviewMetrics.mockResolvedValue({
      category_breakdown: [],
      inventory_sales_revenue: 40,
      owner_breakdown: [],
      recent_sales: [],
      total_expense: 0,
      total_income: 40,
      wallets_count: 1,
    });
    mocks.isInventoryRealtimeEnabled.mockResolvedValue(false);
  });

  it('returns the protected dashboard snapshot through the overview API', async () => {
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: withPermissions([
          'view_inventory_dashboard',
          'view_inventory_sales',
          'view_inventory_stock',
        ]),
        wsId: 'ws-1',
      },
    });

    const { GET } = await import('./route');
    const response = await GET(
      new Request(
        'http://localhost/api/v1/workspaces/personal/inventory/overview'
      ),
      {
        params: Promise.resolve({
          wsId: 'personal',
        }),
      }
    );

    await expect(response.json()).resolves.toMatchObject({
      dashboard: {
        analytics: {
          revenueTrend: [{ date: '2026-06-13', quantity: 2, revenue: 40 }],
        },
        counts: {
          products: 1,
          sales: 1,
        },
      },
    });
    expect(mocks.authorizeInventoryWorkspace).toHaveBeenCalledWith(
      expect.any(Request),
      'personal'
    );
    expect(mocks.getInventoryDashboardSnapshot).toHaveBeenCalledWith({
      sbAdmin: {},
      wsId: 'ws-1',
    });
  });

  it('hides stock dashboard details when stock access is missing', async () => {
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: withPermissions([
          'view_inventory_dashboard',
          'view_inventory_sales',
        ]),
        wsId: 'ws-1',
      },
    });

    const { GET } = await import('./route');
    const response = await GET(
      new Request('http://localhost/api/v1/workspaces/ws-1/inventory/overview'),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    await expect(response.json()).resolves.toMatchObject({
      dashboard: {
        actions: [],
        counts: {
          lowStock: 0,
          products: 1,
          sales: 1,
          stockRows: 0,
        },
        readiness: [
          {
            completed: 1,
            key: 'products',
            score: 100,
            total: 1,
          },
        ],
        risks: [
          {
            kind: 'stale_checkout',
            view: 'commerce',
          },
        ],
      },
      low_stock_products: [],
    });
    expect(mocks.getInventoryLowStockProducts).not.toHaveBeenCalled();
  });

  it('hides sales-only dashboard risks when sales access is missing', async () => {
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: withPermissions(['view_inventory_dashboard']),
        wsId: 'ws-1',
      },
    });

    const { GET } = await import('./route');
    const response = await GET(
      new Request('http://localhost/api/v1/workspaces/ws-1/inventory/overview'),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    await expect(response.json()).resolves.toMatchObject({
      dashboard: {
        counts: {
          sales: 0,
        },
        risks: [],
      },
    });
  });

  it('rejects users without dashboard access', async () => {
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: withPermissions([]),
        wsId: 'ws-1',
      },
    });

    const { GET } = await import('./route');
    const response = await GET(
      new Request('http://localhost/api/v1/workspaces/ws-1/inventory/overview'),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(403);
    expect(mocks.getInventoryDashboardSnapshot).not.toHaveBeenCalled();
  });
});
