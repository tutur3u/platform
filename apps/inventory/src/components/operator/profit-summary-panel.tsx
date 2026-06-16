'use client';

import { useQuery } from '@tanstack/react-query';
import { CircleDollarSign, Coins, Package, Percent } from '@tuturuuu/icons';
import {
  getInventoryCostingAnalytics,
  type InventorySaleSummary,
  listInventoryCostProfiles,
  listInventorySalesByProduct,
} from '@tuturuuu/internal-api/inventory';
import { useTranslations } from 'next-intl';
import { OperatorMetricCard } from './operator-dashboard-primitives';
import { money } from './operator-format';
import { buildProductPnl, computeProfitSummary } from './operator-pnl';

export function ProfitSummaryPanel({
  sales,
  wsId,
}: {
  sales: InventorySaleSummary[];
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.commerce.pnl');
  const analytics = useQuery({
    queryFn: () => getInventoryCostingAnalytics(wsId),
    queryKey: ['inventory', wsId, 'costing-analytics'],
  });

  const salesByProduct = useQuery({
    queryFn: () => listInventorySalesByProduct(wsId),
    queryKey: ['inventory', wsId, 'sales-by-product'],
  });
  const costProfiles = useQuery({
    queryFn: () => listInventoryCostProfiles(wsId, { pageSize: 100 }),
    queryKey: ['inventory', wsId, 'costing', 'pnl'],
  });

  const summary = computeProfitSummary(
    sales,
    analytics.data?.averageMarginPercentage
  );
  const productRows = buildProductPnl(
    salesByProduct.data?.data ?? [],
    costProfiles.data?.data ?? []
  );

  return (
    <section className="grid gap-3 rounded-lg border border-border bg-card p-4">
      <div>
        <h3 className="font-semibold text-sm">{t('title')}</h3>
        <p className="mt-1 text-muted-foreground text-xs leading-5">
          {t('description')}
        </p>
      </div>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OperatorMetricCard
          icon={CircleDollarSign}
          label={t('revenue')}
          value={money(summary.revenue)}
        />
        <OperatorMetricCard
          description={t('estimated')}
          icon={Coins}
          label={t('grossProfit')}
          tone={summary.estGrossProfit > 0 ? 'success' : 'default'}
          value={money(summary.estGrossProfit)}
        />
        <OperatorMetricCard
          description={t('estimated')}
          icon={Percent}
          label={t('margin')}
          value={`${summary.marginPercentage}%`}
        />
        <OperatorMetricCard
          icon={Package}
          label={t('units')}
          value={summary.unitsSold}
        />
      </div>
      {productRows.length > 0 ? (
        <div className="grid gap-2">
          <p className="font-medium text-sm">{t('byProduct')}</p>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="border-border border-b bg-muted/40 text-muted-foreground text-xs">
                <tr>
                  <th className="px-3 py-2 font-semibold">{t('product')}</th>
                  <th className="px-3 py-2 text-right font-semibold">
                    {t('units')}
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">
                    {t('revenue')}
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">
                    {t('cost')}
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">
                    {t('profit')}
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">
                    {t('margin')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {productRows.map((row) => (
                  <tr className="border-border/70 border-t" key={row.productId}>
                    <td className="px-3 py-2">
                      <span className="block max-w-[16rem] truncate font-medium">
                        {row.productName}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">{row.unitsSold}</td>
                    <td className="px-3 py-2 text-right">
                      {money(row.revenue)}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {row.estCogs === null ? '—' : money(row.estCogs)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {row.estProfit === null ? '—' : money(row.estProfit)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {row.marginPercentage === null ? (
                        <span className="text-muted-foreground text-xs">
                          {t('uncosted')}
                        </span>
                      ) : (
                        `${row.marginPercentage}%`
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
