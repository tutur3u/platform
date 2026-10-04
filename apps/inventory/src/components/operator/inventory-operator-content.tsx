'use client';

import { AuditRows } from './audit-rows';
import { BundleComponentsPanel } from './bundle-components-panel';
import { CatalogWorkspacePanel } from './catalog-workspace-panel';
import { CommercePanel } from './commerce-panel';
import { CostingPanel } from './costing-panel';
import { InventoryGuidance } from './inventory-guidance';
import { InfiniteListFooter } from './operator-shell';
import type {
  InventoryCatalogTab,
  InventoryCommerceTab,
  InventoryOperatorView,
} from './operator-types';
import { OverviewPanel } from './overview-panel';
import { PaymentsHubPanel } from './payments-hub-panel';
import { PromotionsWorkspacePanel } from './promotions-workspace-panel';
import { SetupPanel } from './setup-panel';
import { SimpleRows } from './simple-rows';
import { StockWorkspacePanel } from './stock-workspace-panel';
import { StorefrontAnalyticsPanel } from './storefront-analytics-panel';
import { StorefrontListingsPanel } from './storefront-listings-panel';
import type { useInventoryData } from './use-inventory-data';
import type { useInventorySearchResults } from './use-inventory-search-results';

export type InventoryOperatorContentProps = {
  data: ReturnType<typeof useInventoryData>;
  search: ReturnType<typeof useInventorySearchResults>;
  catalogTab: InventoryCatalogTab;
  commerceTab: InventoryCommerceTab;
  view: InventoryOperatorView;
  wsId: string;
  isLoading: boolean;
  isError: boolean;
  commerceLoading: boolean;
  canExportSales: boolean;
  canMergeSeasons?: boolean;
  onTabChange: (tab: InventoryCatalogTab | InventoryCommerceTab) => void;
};

function renderPanel({
  data,
  search,
  catalogTab,
  commerceTab,
  view,
  wsId,
  isLoading,
  isError,
  commerceLoading,
  canExportSales,
  canMergeSeasons,
  onTabChange,
}: InventoryOperatorContentProps) {
  const {
    batches,
    bundleSearch,
    categorySearch,
    checkoutSearch,
    costingSearch,
    periodProducts,
    products,
    promotionSearch,
    revenueShareSearch,
    sales,
    storefrontSearch,
    suppliers,
  } = search;
  const categories = categorySearch.results;
  const storefronts = storefrontSearch.results;
  const bundles = bundleSearch.results;
  const lowStock = data.overview.data?.low_stock_products ?? [];
  if (isError) return null;
  if (view === 'commerce' || view === 'sales')
    return (
      <CommercePanel
        canExportSales={canExportSales}
        canMergeSeasons={canMergeSeasons}
        checkouts={checkoutSearch.results}
        isLoading={commerceLoading}
        query={data.filters.q}
        revenueShares={revenueShareSearch.results}
        sales={sales}
        salesCount={data.sales.data?.pages[0]?.count ?? sales.length}
        salesSummary={data.commerceSummary.data}
        salesPeriods={data.salesPeriods.data?.data ?? []}
        fetchNextSalesPage={() => data.sales.fetchNextPage()}
        hasNextSalesPage={data.sales.hasNextPage}
        isFetchingNextSalesPage={data.sales.isFetchingNextPage}
        fetchNextProductsPage={() => data.periodProducts.fetchNextPage()}
        hasNextProductsPage={data.periodProducts.hasNextPage}
        isFetchingNextProductsPage={data.periodProducts.isFetchingNextPage}
        productsPageCount={data.periodProducts.data?.pages.length ?? 0}
        isProductsError={
          data.periodProducts.isError ||
          data.periodProducts.isFetchNextPageError
        }
        formOptions={data.formOptions.data}
        filters={data.filters}
        products={periodProducts}
        selectedPeriodId={data.filters.period}
        setFilters={data.setFilters}
        setPeriodId={(period) => {
          void data.setFilters({ period });
        }}
        setTab={onTabChange}
        tab={commerceTab}
        standaloneSales={view === 'sales'}
        wsId={wsId}
      />
    );
  if (view === 'payments') return <PaymentsHubPanel wsId={wsId} />;
  if (isLoading) return null;
  switch (view) {
    case 'overview':
      return (
        <>
          <InventoryGuidance
            costingProfilesCount={data.costingProfiles.data?.data.length ?? 0}
            productsCount={
              data.products.data?.pages[0]?.count ?? products.length
            }
            storefrontsCount={storefronts.length}
            view={view}
            wsId={wsId}
          />
          <OverviewPanel
            bundles={bundles}
            dashboard={data.overview.data?.dashboard}
            formOptions={data.formOptions.data}
            lowStock={lowStock}
            polarSettings={data.polarSettings.data}
            products={products}
            storefronts={storefronts}
            wsId={wsId}
          />
        </>
      );
    case 'catalog':
      return (
        <CatalogWorkspacePanel
          categories={categories}
          categoryPagination={{
            fetchNextPage: () => {
              void data.categories.fetchNextPage();
            },
            hasNextPage: data.categories.hasNextPage,
            isFetchingNextPage: data.categories.isFetchingNextPage,
            totalCount:
              data.categories.data?.pages[0]?.count ?? categories.length,
          }}
          costingProfiles={data.costingProfiles.data?.data ?? []}
          filters={data.filters}
          formOptions={data.formOptions.data}
          onTabChange={onTabChange}
          productPagination={{
            fetchNextPage: () => {
              void data.products.fetchNextPage();
            },
            hasNextPage: data.products.hasNextPage,
            isFetchingNextPage: data.products.isFetchingNextPage,
            totalCount: data.products.data?.pages[0]?.count ?? products.length,
          }}
          products={products}
          tab={catalogTab}
          wsId={wsId}
        />
      );
    case 'stock':
      return (
        <StockWorkspacePanel
          costingProfiles={data.costingProfiles.data?.data ?? []}
          filters={data.filters}
          formOptions={data.formOptions.data}
          pagination={{
            fetchNextPage: () => {
              void data.products.fetchNextPage();
            },
            hasNextPage: data.products.hasNextPage,
            isFetchingNextPage: data.products.isFetchingNextPage,
            totalCount: data.products.data?.pages[0]?.count ?? products.length,
          }}
          products={products}
          wsId={wsId}
        />
      );
    case 'setup':
      return (
        <SetupPanel
          batches={batches}
          options={data.formOptions.data}
          query={data.filters.q}
          suppliers={suppliers}
          wsId={wsId}
        />
      );
    case 'costing':
      return (
        <CostingPanel
          analytics={data.costingAnalytics.data}
          options={data.formOptions.data}
          profiles={costingSearch.results}
          products={products}
          wsId={wsId}
        />
      );
    case 'storefront':
      return (
        <>
          <SimpleRows rows={storefronts} type="storefronts" wsId={wsId} />
          {storefronts.length > 0 ? (
            <>
              <StorefrontAnalyticsPanel wsId={wsId} />
              <StorefrontListingsPanel
                bundles={bundles}
                products={products}
                storefronts={storefronts}
                wsId={wsId}
              />
            </>
          ) : null}
        </>
      );
    case 'bundles':
      return (
        <>
          <SimpleRows
            categories={data.formOptions.data?.categories}
            products={products}
            rows={bundles}
            type="bundles"
            wsId={wsId}
          />
          {bundles.length > 0 ? (
            <BundleComponentsPanel
              bundles={bundles}
              products={products}
              wsId={wsId}
            />
          ) : null}
        </>
      );
    case 'promotions':
      return (
        <PromotionsWorkspacePanel
          promotions={promotionSearch.results}
          wsId={wsId}
        />
      );
    case 'audits':
      return <AuditRows rows={data.audits.data?.data ?? []} wsId={wsId} />;
  }
}

export function InventoryOperatorContent(props: InventoryOperatorContentProps) {
  const {
    data,
    search: { products },
    view,
    isLoading,
    isError,
  } = props;
  return (
    <>
      {renderPanel(props)}
      {!isLoading &&
      !isError &&
      ['bundles', 'costing', 'storefront'].includes(view) ? (
        <InfiniteListFooter
          hasNextPage={data.products.hasNextPage}
          isFetchingNextPage={data.products.isFetchingNextPage}
          loadedCount={products.length}
          onLoadMore={() => {
            void data.products.fetchNextPage();
          }}
          totalCount={data.products.data?.pages[0]?.count ?? products.length}
        />
      ) : null}
    </>
  );
}
