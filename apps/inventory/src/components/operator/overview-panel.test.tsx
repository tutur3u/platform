import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { InventoryDashboardSnapshot } from '@tuturuuu/internal-api/inventory';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { OverviewPanel } from './overview-panel';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params?.count === undefined ? key : `${key}:${params.count}`,
}));

const dashboard: InventoryDashboardSnapshot = {
  actions: [
    {
      kind: 'resolve_low_stock',
      priority: 1,
      view: 'stock',
    },
  ],
  analytics: {
    categoryMix: [{ label: 'Prints', quantity: 3, revenue: 120 }],
    ownerMix: [{ label: 'Owner', quantity: 3, revenue: 120 }],
    revenueTrend: [{ date: '2026-06-13', quantity: 3, revenue: 120 }],
  },
  costing: {
    averageMarginPercentage: 58,
    bestScenario: null,
    lowestBreakEvenQuantity: 3,
    profilesCount: 1,
    scenariosCount: 2,
    weakestScenario: null,
  },
  counts: {
    activeBundles: 1,
    batches: 1,
    bundles: 1,
    categories: 1,
    checkouts: 1,
    costingProfiles: 1,
    listings: 1,
    lowStock: 1,
    manufacturers: 1,
    owners: 1,
    polarReady: 0,
    products: 2,
    publishedListings: 1,
    publishedStorefronts: 1,
    reservedCheckouts: 1,
    sales: 1,
    simulatedCheckoutStorefronts: 1,
    staleCheckouts: 0,
    stockRows: 2,
    storefronts: 1,
    suppliers: 1,
    units: 1,
    warehouses: 1,
  },
  readiness: [
    {
      completed: 3,
      key: 'products',
      score: 100,
      total: 3,
      view: 'catalog',
    },
  ],
  risks: [
    {
      detail: null,
      entityId: 'product-1',
      kind: 'low_stock',
      label: 'Acrylic Keychain',
      metric: 2,
      severity: 'high',
      view: 'stock',
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

describe('OverviewPanel', () => {
  it('renders the command center dashboard sections from snapshot data', () => {
    const queryClient = new QueryClient();
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <OverviewPanel
          bundles={[]}
          dashboard={dashboard}
          lowStock={[]}
          polarSettings={{
            integrations: [],
            productionEnvironment: 'production',
            testingEnvironment: 'sandbox',
            wsId: 'ws-1',
          }}
          products={[]}
          storefronts={[]}
          wsId="ws-1"
        />
      </QueryClientProvider>
    );

    expect(html).toContain('kpis.products');
    expect(html).toContain('readiness.title');
    expect(html).toContain('quickActions');
    expect(html).toContain('revenueTrend');
    expect(html).toContain('attention');
    expect(html).toContain('Acrylic Keychain');
    expect(html).toContain('actions.resolve_low_stock.label');
    expect(html).not.toContain('noRisks');
  });
});
