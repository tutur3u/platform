'use client';

import { Activity, Database, Package, ShoppingCart } from '@tuturuuu/icons';
import type { InventoryAnalyticsResponse } from '@tuturuuu/internal-api/inventory';
import { Progress } from '@tuturuuu/ui/progress';
import { useTranslations } from 'next-intl';
import { OperatorModuleCard } from './operator-dashboard-primitives';

export function deriveAnalyticsSignals(data: InventoryAnalyticsResponse) {
  const activeDays = data.trend.filter((point) => point.sales > 0).length;
  const totalDays = Math.max(data.trend.length, 1);
  const activeProducts = data.summary.activeProducts ?? 0;
  const stockedProducts = data.summary.stockedProducts ?? 0;
  const checkoutCreated = data.storefrontFunnel.checkoutCreated;
  const checkoutCompleted = data.storefrontFunnel.completed;

  return {
    activityCoverage: (activeDays / totalDays) * 100,
    activeDays,
    catalogReadiness:
      activeProducts > 0 ? (stockedProducts / activeProducts) * 100 : 0,
    checkoutCompletion:
      checkoutCreated > 0
        ? Math.min(100, (checkoutCompleted / checkoutCreated) * 100)
        : 0,
    queryDurationMs: data.observability?.queryDurationMs ?? 0,
    stockedProducts,
    totalDays: data.trend.length,
    totalProducts: activeProducts,
  };
}

export function AnalyticsObservability({
  data,
}: {
  data: InventoryAnalyticsResponse;
}) {
  const t = useTranslations('inventory.operator.analyticsCenter');
  const signals = deriveAnalyticsSignals(data);

  return (
    <OperatorModuleCard
      className="gap-3 p-3 sm:gap-4 sm:p-4"
      description={t('observability.description')}
      icon={Activity}
      title={t('observability.title')}
    >
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Signal
          description={t('observability.queryDescription', {
            count: data.observability?.dataPoints ?? data.trend.length,
          })}
          icon={Database}
          label={t('observability.queryDuration')}
          value={t('observability.milliseconds', {
            value: signals.queryDurationMs,
          })}
        />
        <Signal
          description={t('observability.activityDescription', {
            active: signals.activeDays,
            total: signals.totalDays,
          })}
          icon={Activity}
          label={t('observability.activityCoverage')}
          progress={signals.activityCoverage}
          value={`${signals.activityCoverage.toFixed(1)}%`}
        />
        <Signal
          description={t('observability.catalogDescription', {
            stocked: signals.stockedProducts,
            total: signals.totalProducts,
          })}
          icon={Package}
          label={t('observability.catalogReadiness')}
          progress={signals.catalogReadiness}
          value={`${signals.catalogReadiness.toFixed(1)}%`}
        />
        <Signal
          description={t('observability.checkoutDescription')}
          icon={ShoppingCart}
          label={t('observability.checkoutCompletion')}
          progress={signals.checkoutCompletion}
          value={`${signals.checkoutCompletion.toFixed(1)}%`}
        />
      </div>
    </OperatorModuleCard>
  );
}

function Signal({
  description,
  icon: Icon,
  label,
  progress,
  value,
}: {
  description: string;
  icon: typeof Activity;
  label: string;
  progress?: number;
  value: string;
}) {
  return (
    <article className="grid min-w-0 content-start gap-2 rounded-lg border bg-muted/15 p-2.5 sm:p-3">
      <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate text-xs">{label}</span>
      </div>
      <p className="truncate font-semibold text-lg tabular-nums sm:text-xl">
        {value}
      </p>
      {progress === undefined ? null : (
        <Progress className="h-1.5" value={progress} />
      )}
      <p className="line-clamp-2 text-[11px] text-muted-foreground leading-4 sm:text-xs">
        {description}
      </p>
    </article>
  );
}
