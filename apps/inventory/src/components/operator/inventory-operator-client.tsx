'use client';

import {
  Boxes,
  Calculator,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  Layers3,
  PackageSearch,
  ReceiptText,
  Store,
  TicketPercent,
  TriangleAlert,
} from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { parseAsString, useQueryState } from 'nuqs';
import { useMemo } from 'react';
import { BundleForm, StorefrontForm } from './inventory-forms';
import { InventoryOperatorContent } from './inventory-operator-content';
import {
  getInventorySearchStatus,
  getInventoryStatuses,
  getInventoryTabs,
} from './inventory-operator-view';
import { getInventoryQueryState } from './inventory-query-state';
import { OperatorAdvancedFilters } from './operator-advanced-filters';
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
import { useInventoryData } from './use-inventory-data';
import { useInventorySearchResults } from './use-inventory-search-results';
import { WorkspaceCurrencyProvider } from './workspace-currency';

export type { InventoryOperatorView } from './operator-types';

type InventoryOperatorClientProps = {
  canExportSales?: boolean;
  canMergeSeasons?: boolean;
  view: InventoryOperatorView;
  wsId: string;
};

export function InventoryOperatorClient({
  canExportSales = false,
  canMergeSeasons,
  view,
  wsId,
}: InventoryOperatorClientProps) {
  const t = useTranslations('inventory.operator');
  const [tabValue, setTabValue] = useQueryState(
    'tab',
    parseAsString.withDefault('').withOptions({ shallow: true })
  );
  const { catalogTab, commerceTab } = getInventoryTabs(view, tabValue);
  const data = useInventoryData(wsId, view, { catalogTab, commerceTab });
  const search = useInventorySearchResults(data);
  const { products } = search;
  const statusOptions = useMemo<InventoryStatusOption[]>(
    () =>
      getInventoryStatuses(view, commerceTab).map((value) => ({
        value,
        label: t(`statuses.${value}`),
      })),
    [commerceTab, t, view]
  );
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
        sales: [
          ReceiptText,
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
  const { activeQueries, isLoading, isError, commerceLoading } =
    getInventoryQueryState(data, view, catalogTab, commerceTab);

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
        {!['audits', 'overview', 'payments'].includes(view) ? (
          <Toolbar
            filters={data.filters}
            hideStatus={view === 'catalog' && catalogTab === 'categories'}
            searchStatus={getInventorySearchStatus(
              view,
              catalogTab,
              commerceTab,
              search
            )}
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
          {isLoading && !['commerce', 'sales'].includes(view) ? (
            <LoadingRows />
          ) : null}
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
          <InventoryOperatorContent
            data={data}
            search={search}
            catalogTab={catalogTab}
            commerceTab={commerceTab}
            view={view}
            wsId={wsId}
            isLoading={isLoading}
            isError={isError}
            commerceLoading={commerceLoading}
            canExportSales={canExportSales}
            canMergeSeasons={canMergeSeasons}
            onTabChange={(tab) => {
              void data.setFilters({ status: 'all' });
              void setTabValue(tab);
            }}
          />
        </div>
      </SectionShell>
    </WorkspaceCurrencyProvider>
  );
}
