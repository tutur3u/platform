import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  InventoryOperatorContent,
  type InventoryOperatorContentProps,
} from './inventory-operator-content';

const panels = vi.hoisted(() => ({
  commerce: vi.fn((_props: Record<string, unknown>) => null),
  stock: vi.fn((_props: Record<string, unknown>) => null),
  catalog: vi.fn((_props: Record<string, unknown>) => null),
}));
vi.mock('./commerce-panel', () => ({ CommercePanel: panels.commerce }));
vi.mock('./stock-workspace-panel', () => ({
  StockWorkspacePanel: panels.stock,
}));
vi.mock('./catalog-workspace-panel', () => ({
  CatalogWorkspacePanel: panels.catalog,
}));
vi.mock('./audit-rows', () => ({ AuditRows: () => null }));
vi.mock('./bundle-components-panel', () => ({
  BundleComponentsPanel: () => null,
}));
vi.mock('./costing-panel', () => ({ CostingPanel: () => null }));
vi.mock('./inventory-guidance', () => ({ InventoryGuidance: () => null }));
vi.mock('./overview-panel', () => ({ OverviewPanel: () => null }));
vi.mock('./payments-hub-panel', () => ({ PaymentsHubPanel: () => null }));
vi.mock('./promotions-workspace-panel', () => ({
  PromotionsWorkspacePanel: () => null,
}));
vi.mock('./setup-panel', () => ({ SetupPanel: () => null }));
vi.mock('./simple-rows', () => ({ SimpleRows: () => null }));
vi.mock('./storefront-analytics-panel', () => ({
  StorefrontAnalyticsPanel: () => null,
}));
vi.mock('./storefront-listings-panel', () => ({
  StorefrontListingsPanel: () => null,
}));
vi.mock('./operator-shell', () => ({ InfiniteListFooter: () => null }));

function props(): InventoryOperatorContentProps {
  const options = { categories: [] };
  const product = { id: 'product-1' };
  const data = {
    overview: {},
    filters: { q: '', period: '' },
    setFilters: vi.fn(),
    commerceSummary: {},
    products: {
      data: { pages: [{ count: 80 }] },
      fetchNextPage: vi.fn(),
      hasNextPage: true,
      isFetchingNextPage: false,
    },
    categories: { data: { pages: [{ count: 5 }] }, fetchNextPage: vi.fn() },
    sales: { fetchNextPage: vi.fn() },
    periodProducts: {
      fetchNextPage: vi.fn(),
      data: { pages: [{ data: [] }, { data: [] }] },
      isFetchNextPageError: true,
    },
    formOptions: { data: options },
    costingProfiles: {},
    salesPeriods: {},
  } as unknown as InventoryOperatorContentProps['data'];
  const search = {
    products: [product],
    periodProducts: [product],
    sales: [],
    categorySearch: { results: [] },
    storefrontSearch: { results: [] },
    bundleSearch: { results: [] },
    checkoutSearch: { results: [] },
    costingSearch: { results: [] },
    promotionSearch: { results: [] },
    revenueShareSearch: { results: [] },
    batches: [],
    suppliers: [],
  } as unknown as InventoryOperatorContentProps['search'];
  return {
    data,
    search,
    view: 'sales',
    catalogTab: 'products',
    commerceTab: 'sales',
    wsId: 'workspace-1',
    isLoading: false,
    isError: false,
    commerceLoading: false,
    canExportSales: false,
    onTabChange: vi.fn(),
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('passes raw sales product page progress and pagination failure even when no visible products were added', () => {
  render(<InventoryOperatorContent {...props()} />);
  const forwarded = panels.commerce.mock.calls.at(-1)?.[0];
  expect(forwarded?.productsPageCount).toBe(2);
  expect(forwarded?.isProductsError).toBe(true);
});

describe('inventory content dispatch', () => {
  it('keeps checkout loading mounted and forwards explicit or absent merge permission', () => {
    const initial = props();
    const view = render(
      <InventoryOperatorContent {...initial} isLoading commerceLoading />
    );
    expect(panels.commerce.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        canMergeSeasons: undefined,
        isLoading: true,
        standaloneSales: true,
        wsId: 'workspace-1',
      })
    );
    view.rerender(<InventoryOperatorContent {...initial} canMergeSeasons />);
    expect(panels.commerce.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ canMergeSeasons: true })
    );
  });
  it('does not render actionable views for errors or cold catalog loads', () => {
    const initial = props();
    const view = render(<InventoryOperatorContent {...initial} isError />);
    expect(panels.commerce).not.toHaveBeenCalled();
    view.rerender(
      <InventoryOperatorContent {...initial} view="catalog" isLoading />
    );
    expect(panels.catalog).not.toHaveBeenCalled();
  });
  it('retains product pagination and catalog tab callbacks', () => {
    const initial = props();
    render(<InventoryOperatorContent {...initial} view="catalog" />);
    const panel = panels.catalog.mock.calls[0]?.[0] as unknown as {
      productPagination: { fetchNextPage: () => void; totalCount: number };
      onTabChange: (tab: string) => void;
    };
    expect(panel.productPagination.totalCount).toBe(80);
    panel.productPagination.fetchNextPage();
    expect(initial.data.products.fetchNextPage).toHaveBeenCalledOnce();
    panel.onTabChange('categories');
    expect(initial.onTabChange).toHaveBeenCalledWith('categories');
  });
});
