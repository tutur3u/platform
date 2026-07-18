'use client';

import {
  Boxes,
  Calculator,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  Layers3,
  PackageSearch,
  Store,
  TicketPercent,
  TriangleAlert,
} from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { parseAsString, useQueryState } from 'nuqs';
import { useMemo } from 'react';
import { AuditRows } from './audit-rows';
import { BundleComponentsPanel } from './bundle-components-panel';
import { CatalogWorkspacePanel } from './catalog-workspace-panel';
import { CommercePanel } from './commerce-panel';
import { CostingPanel } from './costing-panel';
import { BundleForm, StorefrontForm } from './inventory-forms';
import { InventoryGuidance } from './inventory-guidance';
import { OperatorAdvancedFilters } from './operator-advanced-filters';
import {
  InfiniteListFooter,
  LoadingRows,
  SectionShell,
  StatePanel,
  Toolbar,
} from './operator-shell';
import type {
  InventoryCatalogTab,
  InventoryCommerceTab,
  InventoryOperatorView,
  InventoryStatusOption,
} from './operator-types';
import { OverviewPanel } from './overview-panel';
import { PaymentsHubPanel } from './payments-hub-panel';
import { filterInventoryProducts } from './product-filters';
import { PromotionsWorkspacePanel } from './promotions-workspace-panel';
import { SetupPanel } from './setup-panel';
import { SimpleRows } from './simple-rows';
import { StockWorkspacePanel } from './stock-workspace-panel';
import { StorefrontAnalyticsPanel } from './storefront-analytics-panel';
import { StorefrontListingsPanel } from './storefront-listings-panel';
import { useInventoryData } from './use-inventory-data';
import { WorkspaceCurrencyProvider } from './workspace-currency';

export type { InventoryOperatorView } from './operator-types';

type InventoryOperatorClientProps = {
  view: InventoryOperatorView;
  wsId: string;
};

type InventoryQueryState = {
  hasData: boolean;
  isError: boolean;
  isFetching: boolean;
  isPending: boolean;
  refetch: () => unknown;
};

const commerceTabs = ['checkouts', 'cart', 'sales', 'revenue-share'] as const;
const catalogTabs = ['products', 'categories'] as const;

export function InventoryOperatorClient({
  view,
  wsId,
}: InventoryOperatorClientProps) {
  const t = useTranslations('inventory.operator');
  const [tabValue, setTabValue] = useQueryState(
    'tab',
    parseAsString.withDefault('').withOptions({ shallow: true })
  );
  const commerceTab: InventoryCommerceTab = commerceTabs.includes(
    tabValue as InventoryCommerceTab
  )
    ? (tabValue as InventoryCommerceTab)
    : 'checkouts';
  const catalogTab: InventoryCatalogTab = catalogTabs.includes(
    tabValue as InventoryCatalogTab
  )
    ? (tabValue as InventoryCatalogTab)
    : 'products';
  const data = useInventoryData(wsId, view, { catalogTab, commerceTab });
  const loadedProducts =
    data.products.data?.pages.flatMap((page) => page.data) ?? [];
  const products = useMemo(
    () =>
      filterInventoryProducts(loadedProducts, {
        ownerId: data.filters.productOwner,
        warehouseId: data.filters.productWarehouse,
      }),
    [data.filters.productOwner, data.filters.productWarehouse, loadedProducts]
  );
  const categories =
    data.categories.data?.pages.flatMap((page) => page.data) ?? [];
  const periodProducts =
    data.periodProducts.data?.pages.flatMap((page) => page.data) ?? [];
  const storefronts = data.storefronts.data?.data ?? [];
  const bundles = data.bundles.data?.data ?? [];
  const sales = data.sales.data?.pages.flatMap((page) => page.data) ?? [];
  const suppliers = data.suppliers.data?.data ?? [];
  const batches = data.batches.data?.data ?? [];
  const lowStock = data.overview.data?.low_stock_products ?? [];
  const statusOptions = useMemo<InventoryStatusOption[]>(() => {
    const all = { label: t('statuses.all'), value: 'all' };

    if (view === 'storefront') {
      return [
        all,
        { label: t('statuses.draft'), value: 'draft' },
        { label: t('statuses.published'), value: 'published' },
        { label: t('statuses.paused'), value: 'paused' },
      ];
    }

    if (view === 'bundles') {
      return [
        all,
        { label: t('statuses.draft'), value: 'draft' },
        { label: t('statuses.active'), value: 'active' },
      ];
    }

    if (view === 'costing') {
      return [
        all,
        { label: t('statuses.draft'), value: 'draft' },
        { label: t('statuses.active'), value: 'active' },
        { label: t('statuses.archived'), value: 'archived' },
      ];
    }

    if (view === 'commerce' && commerceTab === 'checkouts') {
      return [
        all,
        { label: t('statuses.reserved'), value: 'reserved' },
        { label: t('statuses.completed'), value: 'completed' },
      ];
    }

    if (
      view === 'promotions' ||
      (view === 'commerce' &&
        (commerceTab === 'cart' ||
          commerceTab === 'sales' ||
          commerceTab === 'revenue-share'))
    ) {
      return [all];
    }

    return [
      all,
      { label: t('statuses.active'), value: 'active' },
      { label: t('statuses.archived'), value: 'archived' },
    ];
  }, [commerceTab, t, view]);
  const section = useMemo(
    () =>
      ({
        audits: [
          ClipboardList,
          t('views.audits.title'),
          t('views.audits.description'),
        ],
        bundles: [
          Layers3,
          t('views.bundles.title'),
          t('views.bundles.description'),
        ],
        catalog: [
          PackageSearch,
          t('views.catalog.title'),
          t('views.catalog.description'),
        ],
        commerce: [
          CircleDollarSign,
          t('views.commerce.title'),
          t('views.commerce.description'),
        ],
        costing: [
          Calculator,
          t('views.costing.title'),
          t('views.costing.description'),
        ],
        overview: [
          Boxes,
          t('views.overview.title'),
          t('views.overview.description'),
        ],
        payments: [
          CreditCard,
          t('views.payments.title'),
          t('views.payments.description'),
        ],
        promotions: [
          TicketPercent,
          t('views.promotions.title'),
          t('views.promotions.description'),
        ],
        setup: [Boxes, t('views.setup.title'), t('views.setup.description')],
        stock: [
          TriangleAlert,
          t('views.stock.title'),
          t('views.stock.description'),
        ],
        storefront: [
          Store,
          t('views.storefront.title'),
          t('views.storefront.description'),
        ],
      })[view],
    [t, view]
  );
  const Icon = section[0] as typeof Boxes;
  const activeQueries = [
    view === 'overview' ? data.overview : null,
    view === 'overview' ? data.costingProfiles : null,
    view === 'overview' ? data.costingAnalytics : null,
    ['bundles', 'costing', 'stock', 'storefront', 'overview'].includes(view) ||
    (view === 'catalog' && catalogTab === 'products')
      ? data.products
      : null,
    view === 'catalog' && catalogTab === 'categories' ? data.categories : null,
    view === 'storefront' ? data.storefronts : null,
    ['bundles', 'storefront'].includes(view) ? data.bundles : null,
    view === 'commerce' && commerceTab === 'checkouts' ? data.checkouts : null,
    view === 'commerce' && commerceTab === 'sales' ? data.sales : null,
    view === 'commerce' && ['cart', 'sales'].includes(commerceTab)
      ? data.salesPeriods
      : null,
    view === 'commerce' && ['cart', 'sales'].includes(commerceTab)
      ? data.periodProducts
      : null,
    view === 'commerce' && ['cart', 'sales'].includes(commerceTab)
      ? data.formOptions
      : null,
    view === 'commerce' && commerceTab === 'revenue-share'
      ? data.revenueShares
      : null,
    view === 'promotions' ? data.promotions : null,
    view === 'costing' ? data.costingProfiles : null,
    view === 'costing' ? data.costingAnalytics : null,
    view === 'stock' || (view === 'catalog' && catalogTab === 'products')
      ? data.costingProfiles
      : null,
    view === 'audits' ? data.audits : null,
    ['stock', 'setup', 'bundles', 'storefront', 'costing', 'overview'].includes(
      view
    ) ||
    (view === 'catalog' && catalogTab === 'products')
      ? data.formOptions
      : null,
    view === 'setup' ? data.suppliers : null,
    view === 'setup' ? data.batches : null,
  ].flatMap((query) =>
    query
      ? [
          {
            hasData: Boolean(query.data),
            isError: query.isError,
            isFetching: query.isFetching,
            isPending: query.isPending,
            refetch: query.refetch,
          } satisfies InventoryQueryState,
        ]
      : []
  );
  const isLoading = activeQueries.some(
    (query) => query.isPending && !query.hasData
  );
  const isError = activeQueries.some((query) => query.isError);
  const commerceLoading =
    view === 'commerce' && commerceTab === 'checkouts'
      ? data.checkouts.isPending || data.checkouts.isFetching
      : view === 'commerce' && commerceTab === 'cart'
        ? data.periodProducts.isPending ||
          data.formOptions.isPending ||
          data.salesPeriods.isPending
        : view === 'commerce' && commerceTab === 'sales'
          ? data.sales.isPending ||
            data.salesPeriods.isPending ||
            data.commerceSummary.isPending ||
            data.periodProducts.isPending ||
            data.formOptions.isPending
          : view === 'commerce' && commerceTab === 'revenue-share'
            ? data.revenueShares.isPending || data.revenueShares.isFetching
            : false;

  const headerActions =
    view === 'storefront' ? (
      <StorefrontForm wsId={wsId} />
    ) : view === 'bundles' ? (
      <BundleForm
        categories={data.formOptions.data?.categories}
        products={products}
        wsId={wsId}
      />
    ) : null;

  return (
    <WorkspaceCurrencyProvider wsId={wsId}>
      <SectionShell
        actions={headerActions}
        description={section[2] as string}
        icon={<Icon className="h-5 w-5" />}
        title={section[1] as string}
      >
        {view !== 'payments' ? (
          <Toolbar
            filters={data.filters}
            hideStatus={view === 'catalog' && catalogTab === 'categories'}
            setFilters={data.setFilters}
            statusOptions={statusOptions}
          />
        ) : null}
        {((view === 'stock' && tabValue !== 'warehouses') ||
          (view === 'catalog' && catalogTab === 'products')) && (
          <OperatorAdvancedFilters
            filters={data.filters}
            mode="products"
            options={data.formOptions.data}
            setFilters={data.setFilters}
          />
        )}
        <div className="grid gap-4">
          {isLoading && view !== 'commerce' ? <LoadingRows /> : null}
          {isError ? (
            <StatePanel
              actionLabel={t('states.retry')}
              description={t('states.errorDescription')}
              onAction={() => {
                for (const query of activeQueries) query.refetch();
              }}
              title={t('states.errorTitle')}
              tone="danger"
            />
          ) : null}
          {!isLoading && !isError && view === 'overview' ? (
            <>
              <InventoryGuidance
                costingProfilesCount={
                  data.costingProfiles.data?.data.length ?? 0
                }
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
          ) : null}
          {!isLoading && !isError && view === 'catalog' ? (
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
              formOptions={data.formOptions.data}
              onTabChange={(tab) => {
                void data.setFilters({ status: 'all' });
                void setTabValue(tab);
              }}
              productPagination={{
                fetchNextPage: () => {
                  void data.products.fetchNextPage();
                },
                hasNextPage: data.products.hasNextPage,
                isFetchingNextPage: data.products.isFetchingNextPage,
                totalCount:
                  data.products.data?.pages[0]?.count ?? products.length,
              }}
              products={products}
              tab={catalogTab}
              wsId={wsId}
            />
          ) : null}
          {!isLoading && !isError && view === 'stock' ? (
            <StockWorkspacePanel
              costingProfiles={data.costingProfiles.data?.data ?? []}
              formOptions={data.formOptions.data}
              pagination={{
                fetchNextPage: () => {
                  void data.products.fetchNextPage();
                },
                hasNextPage: data.products.hasNextPage,
                isFetchingNextPage: data.products.isFetchingNextPage,
                totalCount:
                  data.products.data?.pages[0]?.count ?? products.length,
              }}
              products={products}
              wsId={wsId}
            />
          ) : null}
          {!isLoading && !isError && view === 'setup' ? (
            <SetupPanel
              batches={batches}
              options={data.formOptions.data}
              suppliers={suppliers}
              wsId={wsId}
            />
          ) : null}
          {!isLoading && !isError && view === 'costing' ? (
            <CostingPanel
              analytics={data.costingAnalytics.data}
              options={data.formOptions.data}
              profiles={data.costingProfiles.data?.data ?? []}
              products={products}
              wsId={wsId}
            />
          ) : null}
          {!isLoading && !isError && view === 'storefront' ? (
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
          ) : null}
          {!isLoading && !isError && view === 'bundles' ? (
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
          ) : null}
          {!isError && view === 'commerce' ? (
            <CommercePanel
              checkouts={data.checkouts.data?.data ?? []}
              isLoading={commerceLoading}
              query={data.filters.q}
              revenueShares={data.revenueShares.data?.data ?? []}
              sales={sales}
              salesCount={data.sales.data?.pages[0]?.count ?? sales.length}
              salesSummary={data.commerceSummary.data}
              salesPeriods={data.salesPeriods.data?.data ?? []}
              fetchNextSalesPage={() => data.sales.fetchNextPage()}
              hasNextSalesPage={data.sales.hasNextPage}
              isFetchingNextSalesPage={data.sales.isFetchingNextPage}
              fetchNextProductsPage={() => data.periodProducts.fetchNextPage()}
              hasNextProductsPage={data.periodProducts.hasNextPage}
              isFetchingNextProductsPage={
                data.periodProducts.isFetchingNextPage
              }
              formOptions={data.formOptions.data}
              filters={data.filters}
              products={periodProducts}
              selectedPeriodId={data.filters.period}
              setFilters={data.setFilters}
              setPeriodId={(period) => {
                void data.setFilters({ period });
              }}
              setTab={(tab: InventoryCommerceTab) => {
                void data.setFilters({ status: 'all' });
                void setTabValue(tab);
              }}
              tab={commerceTab}
              wsId={wsId}
            />
          ) : null}
          {!isLoading && !isError && view === 'promotions' ? (
            <PromotionsWorkspacePanel
              promotions={data.promotions.data?.data ?? []}
              wsId={wsId}
            />
          ) : null}
          {!isLoading && !isError && view === 'audits' ? (
            <AuditRows rows={data.audits.data?.data ?? []} wsId={wsId} />
          ) : null}
          {!isError && view === 'payments' ? (
            <PaymentsHubPanel wsId={wsId} />
          ) : null}
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
              totalCount={
                data.products.data?.pages[0]?.count ?? products.length
              }
            />
          ) : null}
        </div>
      </SectionShell>
    </WorkspaceCurrencyProvider>
  );
}
