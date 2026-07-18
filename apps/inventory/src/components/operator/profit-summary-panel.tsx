'use client';

import { useQuery } from '@tanstack/react-query';
import { CircleDollarSign, Coins, Package, Percent } from '@tuturuuu/icons';
import {
  type InventoryCommerceSummary,
  listInventoryCostProfiles,
  listInventorySalesByProduct,
} from '@tuturuuu/internal-api/inventory';
import { useTranslations } from 'next-intl';
import {
  OperationsTable,
  type OperationsTableColumn,
} from './operations-table';
import { OperatorMetricCard } from './operator-dashboard-primitives';
import { currency as formatCurrency, money } from './operator-format';
import { buildProductPnl, type ProductPnlRow } from './operator-pnl';

export function ProfitSummaryPanel({
  currency,
  summary,
  wsId,
}: {
  currency: string;
  summary?: InventoryCommerceSummary;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.commerce.pnl');
  const salesByProduct = useQuery({
    queryFn: () => listInventorySalesByProduct(wsId),
    queryKey: ['inventory', wsId, 'sales-by-product'],
  });
  const costProfiles = useQuery({
    queryFn: () => listInventoryCostProfiles(wsId, { pageSize: 100 }),
    queryKey: ['inventory', wsId, 'costing', 'pnl'],
  });

  const productRows = buildProductPnl(
    salesByProduct.data?.data ?? [],
    costProfiles.data?.data ?? []
  );
  const columns: OperationsTableColumn<ProductPnlRow>[] = [
    {
      className: 'w-[16rem]',
      header: t('product'),
      key: 'product',
      render: (row) => (
        <span className="block truncate font-medium">{row.productName}</span>
      ),
      sortValue: (row) => row.productName,
    },
    {
      cellClassName: 'tabular-nums lg:text-right',
      className: 'w-[6rem] text-right',
      header: t('units'),
      key: 'units',
      render: (row) => row.unitsSold,
      sortValue: (row) => row.unitsSold,
    },
    {
      cellClassName: 'tabular-nums lg:text-right',
      className: 'w-[9rem] text-right',
      header: t('revenue'),
      key: 'revenue',
      render: (row) => money(row.revenue, currency),
      sortValue: (row) => row.revenue,
    },
    {
      cellClassName: 'tabular-nums text-muted-foreground lg:text-right',
      className: 'w-[9rem] text-right',
      header: t('cost'),
      key: 'cost',
      render: (row) =>
        row.estCogs === null ? '—' : money(row.estCogs, currency),
      sortValue: (row) => row.estCogs,
    },
    {
      cellClassName: 'tabular-nums lg:text-right',
      className: 'w-[9rem] text-right',
      header: t('profit'),
      key: 'profit',
      render: (row) =>
        row.estProfit === null ? '—' : money(row.estProfit, currency),
      sortValue: (row) => row.estProfit,
    },
    {
      cellClassName: 'tabular-nums lg:text-right',
      className: 'w-[8rem] text-right',
      header: t('margin'),
      key: 'margin',
      render: (row) =>
        row.marginPercentage === null ? (
          <span className="text-muted-foreground text-xs">{t('uncosted')}</span>
        ) : (
          `${row.marginPercentage}%`
        ),
      sortValue: (row) => row.marginPercentage,
    },
  ];

  return (
    <section className="grid gap-3 rounded-lg border border-border bg-card p-4">
      <div>
        <h3 className="font-semibold text-sm">{t('title')}</h3>
        <p className="mt-1 text-muted-foreground text-xs leading-5">
          {t('description')}
        </p>
        {(summary?.excludedCurrencyCount ?? 0) > 0 ? (
          <p className="mt-1 text-muted-foreground text-xs leading-5">
            {t('otherCurrenciesExcluded', {
              count: summary?.excludedCurrencyCount ?? 0,
            })}
          </p>
        ) : null}
      </div>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OperatorMetricCard
          icon={CircleDollarSign}
          label={t('revenue')}
          value={formatCurrency(summary?.revenue, currency)}
        />
        <OperatorMetricCard
          description={t('estimated')}
          icon={Coins}
          label={t('grossProfit')}
          tone={
            (summary?.estimatedGrossProfit ?? 0) > 0 ? 'success' : 'default'
          }
          value={formatCurrency(summary?.estimatedGrossProfit, currency)}
        />
        <OperatorMetricCard
          description={t('estimated')}
          icon={Percent}
          label={t('margin')}
          value={`${summary?.estimatedGrossMarginPercentage ?? 0}%`}
        />
        <OperatorMetricCard
          icon={Package}
          label={t('units')}
          value={summary?.unitsSold ?? 0}
        />
      </div>
      {productRows.length > 0 ? (
        <div className="grid gap-2">
          <p className="font-medium text-sm">{t('byProduct')}</p>
          <OperationsTable
            ariaLabel={t('byProduct')}
            columns={columns}
            getRowId={(row) => row.productId}
            minWidth="min-w-[34rem]"
            rows={productRows}
          />
        </div>
      ) : null}
    </section>
  );
}
