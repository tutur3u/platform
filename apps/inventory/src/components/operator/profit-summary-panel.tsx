'use client';

import { useQuery } from '@tanstack/react-query';
import { CircleDollarSign, Coins, Package, Percent } from '@tuturuuu/icons';
import {
  getInventoryCostingAnalytics,
  type InventorySaleSummary,
} from '@tuturuuu/internal-api/inventory';
import { useTranslations } from 'next-intl';
import { OperatorMetricCard } from './operator-dashboard-primitives';
import { currency } from './operator-format';
import { computeProfitSummary } from './operator-pnl';

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

  const summary = computeProfitSummary(
    sales,
    analytics.data?.averageMarginPercentage
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
          value={currency(summary.revenue)}
        />
        <OperatorMetricCard
          description={t('estimated')}
          icon={Coins}
          label={t('grossProfit')}
          tone={summary.estGrossProfit > 0 ? 'success' : 'default'}
          value={currency(summary.estGrossProfit)}
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
    </section>
  );
}
