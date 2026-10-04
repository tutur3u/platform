import type {
  InventoryCatalogTab,
  InventoryCommerceTab,
  InventoryOperatorView,
} from './operator-types';
import type { useInventorySearchResults } from './use-inventory-search-results';

const commerceTabs = ['checkouts', 'cart', 'revenue-share'] as const;
const catalogTabs = ['products', 'categories'] as const;
type Status =
  | 'all'
  | 'draft'
  | 'active'
  | 'archived'
  | 'published'
  | 'paused'
  | 'reserved'
  | 'completed';

export function getInventoryTabs(
  view: InventoryOperatorView,
  tabValue: string
) {
  const commerceTab: InventoryCommerceTab =
    view === 'sales'
      ? 'sales'
      : commerceTabs.includes(tabValue as (typeof commerceTabs)[number])
        ? (tabValue as InventoryCommerceTab)
        : 'checkouts';
  const catalogTab: InventoryCatalogTab = catalogTabs.includes(
    tabValue as InventoryCatalogTab
  )
    ? (tabValue as InventoryCatalogTab)
    : 'products';
  return { catalogTab, commerceTab };
}

export function getInventoryStatuses(
  view: InventoryOperatorView,
  commerceTab: InventoryCommerceTab
): readonly Status[] {
  switch (view) {
    case 'storefront':
      return ['all', 'draft', 'published', 'paused'];
    case 'bundles':
      return ['all', 'draft', 'active'];
    case 'costing':
      return ['all', 'draft', 'active', 'archived'];
    case 'commerce':
      return commerceTab === 'checkouts'
        ? ['all', 'reserved', 'completed']
        : ['all'];
    case 'promotions':
    case 'sales':
      return ['all'];
    default:
      return ['all', 'active', 'archived'];
  }
}

export function getInventorySearchStatus(
  view: InventoryOperatorView,
  catalogTab: InventoryCatalogTab,
  commerceTab: InventoryCommerceTab,
  search: ReturnType<typeof useInventorySearchResults>
) {
  switch (view) {
    case 'catalog':
      return catalogTab === 'categories'
        ? search.categorySearch.status
        : search.productSearch.status;
    case 'storefront':
      return search.storefrontSearch.status;
    case 'bundles':
      return search.bundleSearch.status;
    case 'costing':
      return search.costingSearch.status;
    case 'promotions':
      return search.promotionSearch.status;
    case 'sales':
      return search.saleSearch.status;
    case 'setup':
      return {
        cachedCount: search.setupSearchCount,
        hasCompleteCache: true,
        isLocalFirst: false,
        isRefreshing: false,
      };
    case 'commerce':
      if (commerceTab === 'checkouts') return search.checkoutSearch.status;
      if (commerceTab === 'revenue-share')
        return search.revenueShareSearch.status;
      return search.productSearch.status;
    default:
      return search.productSearch.status;
  }
}
