'use client';

import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query';
import {
  getInventoryCommerceSummary,
  getInventoryCostingAnalytics,
  getInventoryOverview,
  getInventoryPolarSettings,
  getInventoryProductFormOptions,
  listInventoryAuditLogs,
  listInventoryBatches,
  listInventoryBundles,
  listInventoryCheckouts,
  listInventoryCostProfiles,
  listInventoryProductCategories,
  listInventoryProducts,
  listInventoryPromotions,
  listInventoryRevenueShareEarnings,
  listInventorySales,
  listInventorySalesPeriods,
  listInventoryStorefronts,
  listInventorySuppliers,
} from '@tuturuuu/internal-api/inventory';
import { useDebounce } from '@tuturuuu/ui/hooks/use-debounce';
import { parseAsString, useQueryStates } from 'nuqs';
import type {
  InventoryCatalogTab,
  InventoryCommerceTab,
  InventoryOperatorView,
} from './operator-types';
import { UNASSIGNED_SALES_PERIOD_FILTER } from './operator-types';

export function useInventoryData(
  wsId: string,
  view: InventoryOperatorView,
  options?: {
    catalogTab?: InventoryCatalogTab;
    commerceTab?: InventoryCommerceTab;
  }
) {
  const [filters, setFilters] = useQueryStates({
    productCategory: parseAsString.withDefault(''),
    productOwner: parseAsString.withDefault(''),
    productSort: parseAsString.withDefault('created-desc'),
    productWarehouse: parseAsString.withDefault(''),
    q: parseAsString.withDefault(''),
    period: parseAsString.withDefault(''),
    saleCategory: parseAsString.withDefault(''),
    saleCreator: parseAsString.withDefault(''),
    saleSort: parseAsString.withDefault('date-desc'),
    saleWarehouse: parseAsString.withDefault(''),
    status: parseAsString.withDefault('all'),
  });
  const status = filters.status === 'all' ? undefined : filters.status;
  const [serverQuery] = useDebounce(filters.q, 280);
  const catalogTab = options?.catalogTab ?? 'products';
  const commerceTab = options?.commerceTab ?? 'checkouts';
  const isSalesView = view === 'sales' || commerceTab === 'sales';
  const productScope = {
    category: filters.productCategory,
    owner: filters.productOwner,
    sort: filters.productSort,
    status: filters.status,
    warehouse: filters.productWarehouse,
  };
  const salesScope = { period: filters.period };
  const searchKeys = {
    bundles: ['inventory', wsId, 'bundles', { status: filters.status }],
    categories: ['inventory', wsId, 'categories'],
    checkouts: ['inventory', wsId, 'checkouts', { status: filters.status }],
    costingProfiles: ['inventory', wsId, 'costing', { status: filters.status }],
    products: ['inventory', wsId, 'products', productScope],
    promotions: ['inventory', wsId, 'promotions'],
    revenueShares: ['inventory', wsId, 'revenue-share'],
    sales: ['inventory', wsId, 'sales', salesScope],
    storefronts: ['inventory', wsId, 'storefronts', { status: filters.status }],
  } as const;

  const overview = useQuery({
    enabled: view === 'overview',
    queryFn: () => getInventoryOverview(wsId),
    queryKey: ['inventory', wsId, 'overview'],
  });
  const products = useInfiniteQuery({
    enabled:
      ['bundles', 'costing', 'stock', 'storefront', 'overview'].includes(
        view
      ) ||
      (view === 'catalog' && catalogTab === 'products'),
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      listInventoryProducts(wsId, {
        categoryId: filters.productCategory || undefined,
        page: pageParam,
        pageSize: filters.productOwner || filters.productWarehouse ? 1000 : 50,
        q: serverQuery,
        sortBy: filters.productSort.startsWith('name-') ? 'name' : 'created_at',
        sortOrder: filters.productSort.endsWith('-asc') ? 'asc' : 'desc',
        status:
          status === 'active' || status === 'archived' ? status : undefined,
      }),
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((count, page) => count + page.data.length, 0);
      return loaded < lastPage.count ? pages.length + 1 : undefined;
    },
    placeholderData: keepPreviousData,
    queryKey: [...searchKeys.products, serverQuery],
  });
  const categories = useInfiniteQuery({
    enabled: view === 'catalog' && catalogTab === 'categories',
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      listInventoryProductCategories(wsId, {
        page: pageParam,
        pageSize: 50,
        q: serverQuery,
      }),
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((count, page) => count + page.data.length, 0);
      return loaded < lastPage.count ? pages.length + 1 : undefined;
    },
    placeholderData: keepPreviousData,
    queryKey: [...searchKeys.categories, serverQuery],
  });
  const storefronts = useQuery({
    enabled: ['storefront', 'overview'].includes(view),
    queryFn: () =>
      listInventoryStorefronts(wsId, {
        pageSize: 50,
        q: serverQuery,
        status:
          status === 'draft' || status === 'published' || status === 'paused'
            ? status
            : undefined,
      }),
    placeholderData: keepPreviousData,
    queryKey: [...searchKeys.storefronts, serverQuery],
  });
  const bundles = useQuery({
    enabled: ['bundles', 'storefront', 'overview'].includes(view),
    queryFn: () =>
      listInventoryBundles(wsId, {
        pageSize: 50,
        q: serverQuery,
        status: status === 'draft' || status === 'active' ? status : undefined,
      }),
    placeholderData: keepPreviousData,
    queryKey: [...searchKeys.bundles, serverQuery],
  });
  const checkouts = useQuery({
    enabled: view === 'commerce' && commerceTab === 'checkouts',
    queryFn: () =>
      listInventoryCheckouts(wsId, {
        pageSize: 50,
        q: serverQuery,
        status:
          status === 'reserved' || status === 'completed' ? status : undefined,
      }),
    placeholderData: keepPreviousData,
    queryKey: [...searchKeys.checkouts, serverQuery],
  });
  const costingProfiles = useQuery({
    enabled:
      ['costing', 'overview', 'stock'].includes(view) ||
      (view === 'catalog' && catalogTab === 'products'),
    queryFn: () =>
      listInventoryCostProfiles(wsId, {
        pageSize: 50,
        q: serverQuery,
        status:
          status === 'active' || status === 'archived' || status === 'draft'
            ? status
            : undefined,
      }),
    placeholderData: keepPreviousData,
    queryKey: [...searchKeys.costingProfiles, serverQuery],
  });
  const costingAnalytics = useQuery({
    enabled: view === 'costing' || view === 'overview',
    queryFn: () => getInventoryCostingAnalytics(wsId),
    queryKey: ['inventory', wsId, 'costing-analytics'],
  });
  const sales = useInfiniteQuery({
    enabled: isSalesView,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      listInventorySales(wsId, {
        limit: 100,
        offset: pageParam,
        period_id:
          filters.period && filters.period !== UNASSIGNED_SALES_PERIOD_FILTER
            ? filters.period
            : undefined,
        unassigned:
          filters.period === UNASSIGNED_SALES_PERIOD_FILTER || undefined,
      }),
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((count, page) => count + page.data.length, 0);
      return lastPage.data.length > 0 && loaded < lastPage.count
        ? loaded
        : undefined;
    },
    placeholderData: keepPreviousData,
    queryKey: [...searchKeys.sales, serverQuery],
  });
  const commerceSummary = useQuery({
    enabled: isSalesView,
    queryFn: () =>
      getInventoryCommerceSummary(wsId, {
        period_id:
          filters.period && filters.period !== UNASSIGNED_SALES_PERIOD_FILTER
            ? filters.period
            : undefined,
        unassigned:
          filters.period === UNASSIGNED_SALES_PERIOD_FILTER || undefined,
      }),
    queryKey: ['inventory', wsId, 'commerce-summary', filters.period],
  });
  const salesPeriods = useQuery({
    enabled: isSalesView || (view === 'commerce' && commerceTab === 'cart'),
    queryFn: () => listInventorySalesPeriods(wsId, { include_archived: true }),
    queryKey: ['inventory', wsId, 'sales-periods'],
  });
  const periodProducts = useInfiniteQuery({
    enabled: isSalesView || (view === 'commerce' && commerceTab === 'cart'),
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      listInventoryProducts(wsId, {
        page: pageParam,
        pageSize: 50,
        status: 'all',
      }),
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((count, page) => count + page.data.length, 0);
      return loaded < lastPage.count ? pages.length + 1 : undefined;
    },
    queryKey: [
      'inventory',
      wsId,
      'products',
      {
        category: '',
        owner: '',
        sort: 'created-desc',
        status: 'all',
        warehouse: '',
      },
      '',
    ],
  });
  const promotions = useQuery({
    enabled: view === 'promotions',
    queryFn: () =>
      listInventoryPromotions(wsId, { pageSize: 50, q: serverQuery }),
    placeholderData: keepPreviousData,
    queryKey: [...searchKeys.promotions, serverQuery],
  });
  const revenueShares = useQuery({
    enabled: view === 'commerce' && commerceTab === 'revenue-share',
    queryFn: () =>
      listInventoryRevenueShareEarnings(wsId, {
        limit: 50,
        q: serverQuery,
      }),
    placeholderData: keepPreviousData,
    queryKey: [...searchKeys.revenueShares, serverQuery],
  });
  const audits = useQuery({
    enabled: view === 'audits',
    queryFn: () => listInventoryAuditLogs(wsId, { limit: 50 }),
    queryKey: ['inventory', wsId, 'audits'],
  });
  const formOptions = useQuery({
    enabled:
      [
        'bundles',
        'costing',
        'overview',
        'setup',
        'stock',
        'storefront',
      ].includes(view) ||
      (view === 'catalog' && catalogTab === 'products') ||
      isSalesView ||
      (view === 'commerce' && commerceTab === 'cart'),
    queryFn: () => getInventoryProductFormOptions(wsId),
    queryKey: ['inventory', wsId, 'form-options'],
  });
  const suppliers = useQuery({
    enabled: view === 'setup',
    queryFn: () => listInventorySuppliers(wsId, { pageSize: 100 }),
    queryKey: ['inventory', wsId, 'suppliers'],
  });
  const batches = useQuery({
    enabled: view === 'setup',
    queryFn: () => listInventoryBatches(wsId, { pageSize: 100 }),
    queryKey: ['inventory', wsId, 'batches'],
  });
  const polarSettings = useQuery({
    enabled: view === 'overview',
    queryFn: () => getInventoryPolarSettings(wsId),
    queryKey: ['inventory', wsId, 'polar-settings'],
  });

  return {
    audits,
    batches,
    bundles,
    categories,
    checkouts,
    commerceSummary,
    costingAnalytics,
    costingProfiles,
    filters,
    formOptions,
    overview,
    polarSettings,
    periodProducts,
    products,
    promotions,
    revenueShares,
    sales,
    salesPeriods,
    searchKeys,
    serverQuery,
    setFilters,
    storefronts,
    suppliers,
  };
}
