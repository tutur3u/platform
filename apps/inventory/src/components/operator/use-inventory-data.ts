'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getInventoryCostingAnalytics,
  getInventoryOverview,
  getInventoryPolarSettings,
  getInventoryProductFormOptions,
  listInventoryAuditLogs,
  listInventoryBatches,
  listInventoryBundles,
  listInventoryCheckouts,
  listInventoryCostProfiles,
  listInventoryProducts,
  listInventoryPromotions,
  listInventoryRevenueShareEarnings,
  listInventorySales,
  listInventoryStorefronts,
  listInventorySuppliers,
} from '@tuturuuu/internal-api/inventory';
import { parseAsString, useQueryStates } from 'nuqs';
import type {
  InventoryCommerceTab,
  InventoryOperatorView,
} from './operator-types';

export function useInventoryData(
  wsId: string,
  view: InventoryOperatorView,
  options?: {
    commerceTab?: InventoryCommerceTab;
  }
) {
  const [filters, setFilters] = useQueryStates({
    q: parseAsString.withDefault(''),
    status: parseAsString.withDefault('all'),
  });
  const status = filters.status === 'all' ? undefined : filters.status;
  const commerceTab = options?.commerceTab ?? 'checkouts';

  const overview = useQuery({
    enabled: view === 'overview',
    queryFn: () => getInventoryOverview(wsId),
    queryKey: ['inventory', wsId, 'overview'],
  });
  const products = useQuery({
    enabled: [
      'bundles',
      'catalog',
      'costing',
      'setup',
      'stock',
      'storefront',
      'overview',
    ].includes(view),
    queryFn: () =>
      listInventoryProducts(wsId, {
        pageSize: 50,
        q: filters.q,
        status:
          status === 'active' || status === 'archived' ? status : undefined,
      }),
    queryKey: ['inventory', wsId, 'products', filters.q, filters.status],
  });
  const storefronts = useQuery({
    enabled: ['storefront', 'overview'].includes(view),
    queryFn: () =>
      listInventoryStorefronts(wsId, {
        pageSize: 50,
        q: filters.q,
        status:
          status === 'draft' || status === 'published' || status === 'paused'
            ? status
            : undefined,
      }),
    queryKey: ['inventory', wsId, 'storefronts', filters.q, filters.status],
  });
  const bundles = useQuery({
    enabled: ['bundles', 'storefront', 'overview'].includes(view),
    queryFn: () =>
      listInventoryBundles(wsId, {
        pageSize: 50,
        q: filters.q,
        status: status === 'draft' || status === 'active' ? status : undefined,
      }),
    queryKey: ['inventory', wsId, 'bundles', filters.q, filters.status],
  });
  const checkouts = useQuery({
    enabled: view === 'commerce' && commerceTab === 'checkouts',
    queryFn: () =>
      listInventoryCheckouts(wsId, {
        pageSize: 50,
        q: filters.q,
        status:
          status === 'reserved' || status === 'completed' ? status : undefined,
      }),
    queryKey: ['inventory', wsId, 'checkouts', filters.q, filters.status],
  });
  const costingProfiles = useQuery({
    enabled: ['catalog', 'costing', 'overview', 'stock'].includes(view),
    queryFn: () =>
      listInventoryCostProfiles(wsId, {
        pageSize: 50,
        q: filters.q,
        status:
          status === 'active' || status === 'archived' || status === 'draft'
            ? status
            : undefined,
      }),
    queryKey: ['inventory', wsId, 'costing', filters.q, filters.status],
  });
  const costingAnalytics = useQuery({
    enabled: view === 'costing' || view === 'overview',
    queryFn: () => getInventoryCostingAnalytics(wsId),
    queryKey: ['inventory', wsId, 'costing-analytics'],
  });
  const sales = useQuery({
    enabled: view === 'commerce' && commerceTab === 'sales',
    queryFn: () => listInventorySales(wsId, { limit: 50 }),
    queryKey: ['inventory', wsId, 'sales'],
  });
  const promotions = useQuery({
    enabled: view === 'commerce' && commerceTab === 'promotions',
    queryFn: () =>
      listInventoryPromotions(wsId, { pageSize: 50, q: filters.q }),
    queryKey: ['inventory', wsId, 'promotions', filters.q],
  });
  const revenueShares = useQuery({
    enabled: view === 'commerce' && commerceTab === 'revenue-share',
    queryFn: () =>
      listInventoryRevenueShareEarnings(wsId, {
        limit: 50,
        q: filters.q,
      }),
    queryKey: ['inventory', wsId, 'revenue-share', filters.q],
  });
  const audits = useQuery({
    enabled: view === 'audits',
    queryFn: () => listInventoryAuditLogs(wsId, { limit: 50 }),
    queryKey: ['inventory', wsId, 'audits'],
  });
  const formOptions = useQuery({
    enabled: [
      'bundles',
      'catalog',
      'costing',
      'overview',
      'setup',
      'stock',
      'storefront',
    ].includes(view),
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
    checkouts,
    costingAnalytics,
    costingProfiles,
    filters,
    formOptions,
    overview,
    polarSettings,
    products,
    promotions,
    revenueShares,
    sales,
    setFilters,
    storefronts,
    suppliers,
  };
}
