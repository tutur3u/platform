'use client';

import {
  Boxes,
  Calculator,
  CircleDollarSign,
  ClipboardList,
  Layers3,
  PackageSearch,
  Store,
  TriangleAlert,
} from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { useMemo } from 'react';
import { AuditRows } from './audit-rows';
import { BundleComponentsPanel } from './bundle-components-panel';
import { CommercePanel } from './commerce-panel';
import { CostingPanel } from './costing-panel';
import { BundleForm, StorefrontForm } from './inventory-forms';
import { InventoryGuidance } from './inventory-guidance';
import {
  LoadingRows,
  SectionShell,
  StatePanel,
  Toolbar,
} from './operator-shell';
import type {
  InventoryCommerceTab,
  InventoryOperatorView,
  InventoryStatusOption,
} from './operator-types';
import { OverviewPanel } from './overview-panel';
import { ProductCreateForm } from './product-management';
import { ProductsTable } from './products-table';
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
  hasData: boolean;
  isError: boolean;
  isFetching: boolean;
  isPending: boolean;
  refetch: () => unknown;
};

const commerceTabs = ['checkouts', 'sales'] as const;

export function InventoryOperatorClient({
  view,
  wsId,
}: InventoryOperatorClientProps) {
  const t = useTranslations('inventory.operator');
  const [commerceTab, setCommerceTab] = useQueryState(
    'tab',
    parseAsStringLiteral(commerceTabs)
      .withDefault('checkouts')
      .withOptions({ shallow: true })
  );
  const data = useInventoryData(wsId, view, { commerceTab });
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

    if (view === 'commerce' && commerceTab === 'sales') {
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
    [
      'bundles',
      'catalog',
      'costing',
      'stock',
      'setup',
      'storefront',
      'overview',
    ].includes(view)
      ? data.products
      : null,
    view === 'storefront' ? data.storefronts : null,
    ['bundles', 'storefront'].includes(view) ? data.bundles : null,
    view === 'commerce' && commerceTab === 'checkouts' ? data.checkouts : null,
    view === 'commerce' && commerceTab === 'sales' ? data.sales : null,
    view === 'costing' ? data.costingProfiles : null,
    view === 'costing' ? data.costingAnalytics : null,
    ['catalog', 'stock'].includes(view) ? data.costingProfiles : null,
    view === 'audits' ? data.audits : null,
    [
      'catalog',
      'stock',
      'setup',
      'bundles',
      'storefront',
      'costing',
      'overview',
    ].includes(view)
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
      : view === 'commerce' && commerceTab === 'sales'
        ? data.sales.isPending || data.sales.isFetching
        : false;

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
              costingProfilesCount={data.costingProfiles.data?.data.length ?? 0}
              productsCount={products.length}
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
        {!isLoading && !isError && (view === 'catalog' || view === 'stock') ? (
          <>
            {view === 'catalog' ? (
              <ProductCreateForm options={data.formOptions.data} wsId={wsId} />
            ) : null}
            <ProductsTable
              costingProfiles={data.costingProfiles.data?.data ?? []}
              formOptions={data.formOptions.data}
              rows={products}
              view={view}
              wsId={wsId}
            />
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
            <StorefrontForm wsId={wsId} />
            <SimpleRows rows={storefronts} type="storefronts" wsId={wsId} />
            {storefronts.length > 0 ? (
              <StorefrontListingsPanel
                bundles={bundles}
                products={products}
                storefronts={storefronts}
                wsId={wsId}
              />
            ) : null}
          </>
        ) : null}
        {!isLoading && !isError && view === 'bundles' ? (
          <>
            <BundleForm products={products} wsId={wsId} />
            <SimpleRows
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
            sales={sales}
            setTab={(tab: InventoryCommerceTab) => {
              void data.setFilters({ status: 'all' });
              void setCommerceTab(tab);
            }}
            tab={commerceTab}
            wsId={wsId}
          />
        ) : null}
        {!isLoading && !isError && view === 'audits' ? (
          <AuditRows rows={data.audits.data?.data ?? []} wsId={wsId} />
        ) : null}
      </div>
    </SectionShell>
  );
}
