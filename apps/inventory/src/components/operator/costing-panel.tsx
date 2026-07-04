'use client';

import { BarChart3, Plus, TrendingUp, TriangleAlert } from '@tuturuuu/icons';
import type {
  InventoryCostingAnalytics,
  InventoryCostingAnalyticsScenario,
  InventoryCostProfile,
  InventoryProductFormOptionsResponse,
  InventoryProductSummary,
} from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { CostingCharts } from './costing-charts';
import { CostingImportDialog } from './costing-import-dialog';
import { CostingMetricCard } from './costing-metric-card';
import { CostingProfileDialog } from './costing-profile-dialog';
import { CostingProfileList } from './costing-profile-list';
import { currency } from './operator-format';
import { EmptyRow } from './operator-shell';

export function CostingPanel({
  analytics,
  options,
  profiles,
  products,
  wsId,
}: {
  analytics?: InventoryCostingAnalytics;
  options?: InventoryProductFormOptionsResponse;
  profiles: InventoryCostProfile[];
  products: InventoryProductSummary[];
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.costing');
  const bestScenario = analytics?.scenarios.length
    ? [...analytics.scenarios].sort(
        (first, second) =>
          second.grossMarginPercentage - first.grossMarginPercentage
      )[0]
    : null;
  const weakestScenario = analytics?.scenarios.length
    ? [...analytics.scenarios].sort(
        (first, second) =>
          first.grossMarginPercentage - second.grossMarginPercentage
      )[0]
    : null;

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
          <CostingProfileDialog
            options={options}
            products={products}
            trigger={
              <Button type="button">
                <Plus className="h-4 w-4" />
                {t('newProfile')}
              </Button>
            }
            wsId={wsId}
          />
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
      {bestScenario || weakestScenario ? (
        <div className="grid min-w-0 gap-3 lg:grid-cols-2">
          {bestScenario ? (
            <ScenarioSignal
              icon={<TrendingUp className="h-4 w-4" />}
              label={t('bestScenario')}
              scenario={bestScenario}
            />
          ) : null}
          {weakestScenario ? (
            <ScenarioSignal
              icon={<TriangleAlert className="h-4 w-4" />}
              label={t('weakestScenario')}
              scenario={weakestScenario}
            />
          ) : null}
        </div>
      ) : null}
      <CostingCharts analytics={analytics} />
      {profiles.length === 0 ? (
        <EmptyRow
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <CostingProfileDialog
                options={options}
                products={products}
                trigger={
                  <Button type="button" variant="outline">
                    <Plus className="h-4 w-4" />
                    {t('newProfile')}
                  </Button>
                }
                wsId={wsId}
              />
              <CostingImportDialog wsId={wsId} />
            </div>
          }
          description={t('emptyDescription')}
          label={t('emptyTitle')}
        />
      ) : null}
      <CostingProfileList
        options={options}
        products={products}
        profiles={profiles}
        wsId={wsId}
      />
    </div>
  );
}

function ScenarioSignal({
  icon,
  label,
  scenario,
}: {
  icon: ReactNode;
  label: string;
  scenario: InventoryCostingAnalyticsScenario;
}) {
  const t = useTranslations('inventory.operator.costing');

  return (
    <article className="grid min-w-0 gap-2 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium">{label}</p>
          <p className="truncate text-muted-foreground text-xs">
            {scenario.profileName} / {scenario.scenarioName}
          </p>
        </div>
      </div>
      <div className="grid min-w-0 gap-2 sm:grid-cols-3">
        <span className="rounded-md border border-border bg-background p-2">
          <span className="block text-muted-foreground text-xs">
            {t('margin')}
          </span>
          <span className="font-semibold">
            {scenario.grossMarginPercentage}%
          </span>
        </span>
        <span className="rounded-md border border-border bg-background p-2">
          <span className="block text-muted-foreground text-xs">
            {t('breakEven')}
          </span>
          <span className="font-semibold">
            {scenario.breakEvenQuantity ?? '-'}
          </span>
        </span>
        <span className="rounded-md border border-border bg-background p-2">
          <span className="block text-muted-foreground text-xs">
            {t('retail')}
          </span>
          <span className="font-semibold">
            {currency(scenario.targetRetailPrice, scenario.currency)}
          </span>
        </span>
      </div>
    </article>
  );
}
