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
import { BundleComponentsPanel } from './bundle-components-panel';
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
import { PolarSettingsPanel } from './polar-settings-panel';
import { ProductCreateForm } from './product-management';
import { ProductsTable } from './products-table';
import { SaleDetailPanel } from './sale-detail-panel';
import { SetupPanel } from './setup-panel';
import { SimpleRows } from './simple-rows';
import { StorefrontListingsPanel } from './storefront-listings-panel';
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
  const sales = data.sales.data?.data ?? [];
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
    ['bundles', 'catalog', 'stock', 'setup', 'storefront', 'overview'].includes(
      view
    )
      ? data.products
      : null,
    view === 'storefront' ? data.storefronts : null,
    ['bundles', 'storefront'].includes(view) ? data.bundles : null,
    view === 'checkouts' ? data.checkouts : null,
    view === 'sales' ? data.sales : null,
    view === 'audits' ? data.audits : null,
    ['catalog', 'stock', 'setup', 'bundles', 'storefront'].includes(view)
      ? data.formOptions
      : null,
    view === 'setup' ? data.suppliers : null,
    view === 'setup' ? data.batches : null,
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
      <div className="grid gap-4">
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
            polarSettings={data.polarSettings.data}
            products={products}
            storefronts={storefronts}
          />
        ) : null}
        {!isLoading && !isError && (view === 'catalog' || view === 'stock') ? (
          <>
            {view === 'catalog' ? (
              <ProductCreateForm options={data.formOptions.data} wsId={wsId} />
            ) : null}
            <ProductsTable rows={products} view={view} wsId={wsId} />
          </>
        ) : null}
        {!isLoading && !isError && view === 'setup' ? (
          <SetupPanel
            batches={batches}
            options={data.formOptions.data}
            suppliers={suppliers}
            wsId={wsId}
          />
        ) : null}
        {!isLoading && !isError && view === 'storefront' ? (
          <>
            <StorefrontForm wsId={wsId} />
            <SimpleRows rows={storefronts} type="storefronts" wsId={wsId} />
            <StorefrontListingsPanel
              bundles={bundles}
              products={products}
              storefronts={storefronts}
              wsId={wsId}
            />
            <PolarSettingsPanel wsId={wsId} />
          </>
        ) : null}
        {!isLoading && !isError && view === 'bundles' ? (
          <>
            <BundleForm wsId={wsId} />
            <SimpleRows rows={bundles} type="bundles" wsId={wsId} />
            <BundleComponentsPanel
              bundles={bundles}
              products={products}
              wsId={wsId}
            />
          </>
        ) : null}
        {!isLoading && !isError && view === 'checkouts' ? (
          <>
            <StatePanel
              description={t('states.checkoutFeeDescription')}
              title={t('states.checkoutFeeTitle')}
            />
            <PolarSettingsPanel wsId={wsId} />
            <SimpleRows
              rows={data.checkouts.data?.data ?? []}
              type="checkouts"
              wsId={wsId}
            />
          </>
        ) : null}
        {!isLoading && !isError && view === 'sales' ? (
          <>
            <SimpleRows rows={sales} type="sales" wsId={wsId} />
            <SaleDetailPanel sales={sales} wsId={wsId} />
          </>
        ) : null}
        {!isLoading && !isError && view === 'audits' ? (
          <SimpleRows rows={data.audits.data?.data ?? []} type="audits" />
        ) : null}
      </div>
    </SectionShell>
  );
}
