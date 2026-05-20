'use client';

import {
  Boxes,
  CircleDollarSign,
  ClipboardList,
  Layers3,
  PackageSearch,
  Store,
  TriangleAlert,
} from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { CheckoutFeeCalculator } from '@/components/checkout-fee-calculator';
import { BundleForm, StorefrontForm } from './inventory-forms';
import {
  LoadingRows,
  SectionShell,
  StatePanel,
  Toolbar,
} from './operator-shell';
import type {
  InventoryOperatorView,
  InventoryStatusOption,
} from './operator-types';
import { OverviewPanel } from './overview-panel';
import { ProductsTable } from './products-table';
import { SimpleRows } from './simple-rows';
import { useInventoryData } from './use-inventory-data';

export type { InventoryOperatorView } from './operator-types';

type InventoryOperatorClientProps = {
  view: InventoryOperatorView;
  wsId: string;
};

type InventoryQueryState = {
  isError: boolean;
  isPending: boolean;
  refetch: () => unknown;
};

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

    if (view === 'checkouts') {
      return [
        all,
        { label: t('statuses.reserved'), value: 'reserved' },
        { label: t('statuses.completed'), value: 'completed' },
      ];
    }

    return [
      all,
      { label: t('statuses.active'), value: 'active' },
      { label: t('statuses.archived'), value: 'archived' },
    ];
  }, [t, view]);
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
  const activeQueries = [
    view === 'overview' ? data.overview : null,
    ['catalog', 'stock', 'setup', 'overview'].includes(view)
      ? data.products
      : null,
    ['storefront', 'overview'].includes(view) ? data.storefronts : null,
    ['bundles', 'overview'].includes(view) ? data.bundles : null,
    view === 'checkouts' ? data.checkouts : null,
    view === 'sales' ? data.sales : null,
    view === 'audits' ? data.audits : null,
  ].flatMap((query) =>
    query
      ? [
          {
            isError: query.isError,
            isPending: query.isPending,
            refetch: query.refetch,
          } satisfies InventoryQueryState,
        ]
      : []
  );
  const isLoading = activeQueries.some((query) => query.isPending);
  const isError = activeQueries.some((query) => query.isError);

  return (
    <SectionShell
      description={section[2] as string}
      icon={<Icon className="h-5 w-5" />}
      title={section[1] as string}
    >
      <Toolbar
        filters={data.filters}
        setFilters={data.setFilters}
        statusOptions={statusOptions}
      />
      {isLoading ? <LoadingRows /> : null}
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
        <OverviewPanel
          bundles={bundles}
          lowStock={lowStock}
          products={products}
          storefronts={storefronts}
        />
      ) : null}
      {!isLoading &&
      !isError &&
      (view === 'catalog' || view === 'stock' || view === 'setup') ? (
        <ProductsTable rows={products} view={view} />
      ) : null}
      {!isLoading && !isError && view === 'storefront' ? (
        <>
          <SimpleRows rows={storefronts} type="storefronts" />
          <StorefrontForm wsId={wsId} />
        </>
      ) : null}
      {!isLoading && !isError && view === 'bundles' ? (
        <>
          <SimpleRows rows={bundles} type="bundles" />
          <BundleForm wsId={wsId} />
        </>
      ) : null}
      {!isLoading && !isError && view === 'checkouts' ? (
        <>
          <div className="border-border border-b p-4">
            <CheckoutFeeCalculator />
          </div>
          <SimpleRows rows={data.checkouts.data?.data ?? []} type="checkouts" />
        </>
      ) : null}
      {!isLoading && !isError && view === 'sales' ? (
        <SimpleRows rows={data.sales.data?.data ?? []} type="sales" />
      ) : null}
      {!isLoading && !isError && view === 'audits' ? (
        <SimpleRows rows={data.audits.data?.data ?? []} type="audits" />
      ) : null}
    </SectionShell>
  );
}
