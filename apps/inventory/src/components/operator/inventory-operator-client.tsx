'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Boxes,
  CircleDollarSign,
  ClipboardList,
  Layers3,
  PackageSearch,
  Store,
  TriangleAlert,
} from '@tuturuuu/icons';
import {
  getInventoryOverview,
  listInventoryAuditLogs,
  listInventoryBundles,
  listInventoryCheckouts,
  listInventoryProducts,
  listInventorySales,
  listInventoryStorefronts,
} from '@tuturuuu/internal-api/inventory';
import { useTranslations } from 'next-intl';
import { parseAsString, useQueryStates } from 'nuqs';
import { useMemo } from 'react';
import {
  BundleForm,
  OverviewPanel,
  ProductsTable,
  SectionShell,
  SimpleRows,
  StorefrontForm,
  Toolbar,
} from './inventory-operator-panels';

export type InventoryOperatorView =
  | 'audits'
  | 'bundles'
  | 'catalog'
  | 'checkouts'
  | 'overview'
  | 'sales'
  | 'setup'
  | 'stock'
  | 'storefront';

type InventoryOperatorClientProps = {
  view: InventoryOperatorView;
  wsId: string;
};

function useInventoryData(wsId: string, view: InventoryOperatorView) {
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

  return {
    audits,
    bundles,
    checkouts,
    filters,
    overview,
    products,
    sales,
    setFilters,
    storefronts,
  };
}

export function InventoryOperatorClient({
  view,
  wsId,
}: InventoryOperatorClientProps) {
  const t = useTranslations('inventory.operator');
  const data = useInventoryData(wsId, view);
  const products = data.products.data?.data ?? [];
  const storefronts = data.storefronts.data?.data ?? [];
  const bundles = data.bundles.data?.data ?? [];
  const lowStock = data.overview.data?.low_stock_products ?? [];
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
        checkouts: [
          CircleDollarSign,
          t('views.checkouts.title'),
          t('views.checkouts.description'),
        ],
        overview: [
          Boxes,
          t('views.overview.title'),
          t('views.overview.description'),
        ],
        sales: [
          CircleDollarSign,
          t('views.sales.title'),
          t('views.sales.description'),
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

  return (
    <SectionShell
      description={section[2] as string}
      icon={<Icon className="h-5 w-5" />}
      title={section[1] as string}
    >
      <Toolbar filters={data.filters} setFilters={data.setFilters} />
      {view === 'overview' ? (
        <OverviewPanel
          bundles={bundles}
          lowStock={lowStock}
          products={products}
          storefronts={storefronts}
        />
      ) : null}
      {view === 'catalog' || view === 'stock' || view === 'setup' ? (
        <ProductsTable rows={products} view={view} />
      ) : null}
      {view === 'storefront' ? (
        <>
          <SimpleRows rows={storefronts} type="storefronts" />
          <StorefrontForm wsId={wsId} />
        </>
      ) : null}
      {view === 'bundles' ? (
        <>
          <SimpleRows rows={bundles} type="bundles" />
          <BundleForm wsId={wsId} />
        </>
      ) : null}
      {view === 'checkouts' ? (
        <SimpleRows rows={data.checkouts.data?.data ?? []} type="checkouts" />
      ) : null}
      {view === 'sales' ? (
        <SimpleRows rows={data.sales.data?.data ?? []} type="sales" />
      ) : null}
      {view === 'audits' ? (
        <SimpleRows rows={data.audits.data?.data ?? []} type="audits" />
      ) : null}
    </SectionShell>
  );
}
