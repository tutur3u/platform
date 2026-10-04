import type {
  InventoryCatalogTab,
  InventoryCommerceTab,
  InventoryOperatorView,
} from './operator-types';

type InventoryQueryState = {
  hasData: boolean;
  isError: boolean;
  isFetching: boolean;
  isPending: boolean;
  refetch: () => unknown;
};

type InventoryQueryInput = Omit<InventoryQueryState, 'hasData'> & {
  data: unknown;
};

export type InventoryQueryInputs = Record<
  | 'overview'
  | 'products'
  | 'categories'
  | 'storefronts'
  | 'bundles'
  | 'checkouts'
  | 'sales'
  | 'commerceSummary'
  | 'salesPeriods'
  | 'periodProducts'
  | 'formOptions'
  | 'revenueShares'
  | 'promotions'
  | 'costingProfiles'
  | 'costingAnalytics'
  | 'audits'
  | 'suppliers'
  | 'batches',
  InventoryQueryInput
>;

export function getInventoryQueryState(
  data: InventoryQueryInputs,
  view: InventoryOperatorView,
  catalogTab: InventoryCatalogTab,
  commerceTab: InventoryCommerceTab
) {
  const activeQueries = [
    view === 'overview' ? data.overview : null,
    ['bundles', 'costing', 'stock', 'storefront'].includes(view) ||
    (view === 'catalog' && catalogTab === 'products')
      ? data.products
      : null,
    view === 'catalog' && catalogTab === 'categories' ? data.categories : null,
    view === 'storefront' ? data.storefronts : null,
    ['bundles', 'storefront'].includes(view) ? data.bundles : null,
    view === 'commerce' && commerceTab === 'checkouts' ? data.checkouts : null,
    view === 'sales' || (view === 'commerce' && commerceTab === 'sales')
      ? data.sales
      : null,
    view === 'sales' || (view === 'commerce' && commerceTab === 'sales')
      ? data.commerceSummary
      : null,
    view === 'sales' ||
    (view === 'commerce' && ['cart', 'sales'].includes(commerceTab))
      ? data.salesPeriods
      : null,
    view === 'sales' ||
    (view === 'commerce' && ['cart', 'sales'].includes(commerceTab))
      ? data.periodProducts
      : null,
    view === 'sales' ||
    (view === 'commerce' && ['cart', 'sales'].includes(commerceTab))
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
    ['stock', 'setup', 'bundles', 'storefront', 'costing'].includes(view) ||
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
    view === 'sales'
      ? (data.sales.isPending && !data.sales.data) ||
        (data.salesPeriods.isPending && !data.salesPeriods.data) ||
        (data.commerceSummary.isPending && !data.commerceSummary.data) ||
        (data.periodProducts.isPending && !data.periodProducts.data) ||
        (data.formOptions.isPending && !data.formOptions.data)
      : view === 'commerce' && commerceTab === 'checkouts'
        ? data.checkouts.isPending && !data.checkouts.data
        : view === 'commerce' && commerceTab === 'cart'
          ? (data.periodProducts.isPending && !data.periodProducts.data) ||
            (data.formOptions.isPending && !data.formOptions.data) ||
            (data.salesPeriods.isPending && !data.salesPeriods.data)
          : view === 'commerce' && commerceTab === 'sales'
            ? (data.sales.isPending && !data.sales.data) ||
              (data.salesPeriods.isPending && !data.salesPeriods.data) ||
              (data.commerceSummary.isPending && !data.commerceSummary.data) ||
              (data.periodProducts.isPending && !data.periodProducts.data) ||
              (data.formOptions.isPending && !data.formOptions.data)
            : view === 'commerce' && commerceTab === 'revenue-share'
              ? data.revenueShares.isPending && !data.revenueShares.data
              : false;

  return { activeQueries, isLoading, isError, commerceLoading };
}
