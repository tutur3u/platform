'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getInventoryOverview,
  getInventoryPolarSettings,
  listInventoryAuditLogs,
  listInventoryBundles,
  listInventoryCheckouts,
  listInventoryProducts,
  listInventorySales,
  listInventoryStorefronts,
} from '@tuturuuu/internal-api/inventory';
import { parseAsString, useQueryStates } from 'nuqs';
import type { InventoryOperatorView } from './operator-types';

export function useInventoryData(wsId: string, view: InventoryOperatorView) {
  const [filters, setFilters] = useQueryStates({
    q: parseAsString.withDefault(''),
    status: parseAsString.withDefault('all'),
  });
  const status = filters.status === 'all' ? undefined : filters.status;

  const overview = useQuery({
    enabled: view === 'overview',
    queryFn: () => getInventoryOverview(wsId),
    queryKey: ['inventory', wsId, 'overview'],
  });
  const products = useQuery({
    enabled: ['catalog', 'stock', 'setup', 'overview'].includes(view),
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
    enabled: ['bundles', 'overview'].includes(view),
    queryFn: () =>
      listInventoryBundles(wsId, {
        pageSize: 50,
        q: filters.q,
        status: status === 'draft' || status === 'active' ? status : undefined,
      }),
    queryKey: ['inventory', wsId, 'bundles', filters.q, filters.status],
  });
  const checkouts = useQuery({
    enabled: view === 'checkouts',
    queryFn: () =>
      listInventoryCheckouts(wsId, {
        pageSize: 50,
        q: filters.q,
        status:
          status === 'reserved' || status === 'completed' ? status : undefined,
      }),
    queryKey: ['inventory', wsId, 'checkouts', filters.q, filters.status],
  });
  const sales = useQuery({
    enabled: view === 'sales',
    queryFn: () => listInventorySales(wsId, { limit: 50 }),
    queryKey: ['inventory', wsId, 'sales'],
  });
  const audits = useQuery({
    enabled: view === 'audits',
    queryFn: () => listInventoryAuditLogs(wsId, { limit: 50 }),
    queryKey: ['inventory', wsId, 'audits'],
  });
  const polarSettings = useQuery({
    enabled: ['checkouts', 'overview', 'storefront'].includes(view),
    queryFn: () => getInventoryPolarSettings(wsId),
    queryKey: ['inventory', wsId, 'polar-settings'],
  });

  return {
    audits,
    bundles,
    checkouts,
    filters,
    overview,
    polarSettings,
    products,
    sales,
    setFilters,
    storefronts,
  };
}
