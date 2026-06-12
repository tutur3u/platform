'use client';

import { BarChart3, FileSpreadsheet, Plus } from '@tuturuuu/icons';
import type {
  InventoryCostingAnalytics,
  InventoryCostProfile,
  InventoryProductFormOptionsResponse,
} from '@tuturuuu/internal-api/inventory';
import { useTranslations } from 'next-intl';
import { CostingCharts } from './costing-charts';
import { CostingImportDialog } from './costing-import-dialog';
import { CostingMetricCard } from './costing-metric-card';
import { CostingProfileForm } from './costing-profile-form';
import { CostingProfileList } from './costing-profile-list';
import { EmptyRow } from './operator-shell';

export function CostingPanel({
  analytics,
  options,
  profiles,
  wsId,
}: {
  analytics?: InventoryCostingAnalytics;
  options?: InventoryProductFormOptionsResponse;
  profiles: InventoryCostProfile[];
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.costing');

  return (
    <div className="grid gap-4">
      <section className="grid gap-3 rounded-lg border border-border bg-card p-4 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <BarChart3 className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="font-semibold">{t('summary')}</h2>
            <p className="mt-1 text-muted-foreground text-sm leading-6">
              {t('summaryDescription')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <CostingImportDialog wsId={wsId} />
        </div>
      </section>
      <div className="grid gap-3 sm:grid-cols-3">
        <CostingMetricCard
          label={t('profiles')}
          value={analytics?.profilesCount ?? profiles.length}
        />
        <CostingMetricCard
          label={t('averageMargin')}
          value={`${analytics?.averageMarginPercentage ?? 0}%`}
        />
        <CostingMetricCard
          label={t('lowestBreakEven')}
          value={analytics?.lowestBreakEvenQuantity ?? '-'}
        />
      </div>
      <CostingCharts analytics={analytics} />
      {profiles.length === 0 ? (
        <EmptyRow
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <span className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 font-medium text-sm">
                <Plus className="h-4 w-4" />
                {t('newProfile')}
              </span>
              <span className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 font-medium text-sm">
                <FileSpreadsheet className="h-4 w-4" />
                {t('importCsv')}
              </span>
            </div>
          }
          description={t('emptyDescription')}
          label={t('emptyTitle')}
        />
      ) : null}
      <CostingProfileForm options={options} wsId={wsId} />
      <CostingProfileList profiles={profiles} wsId={wsId} />
    </div>
  );
}
