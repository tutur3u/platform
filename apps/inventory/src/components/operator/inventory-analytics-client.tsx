'use client';

import { useQuery } from '@tanstack/react-query';
import { BarChart3, RefreshCw, TriangleAlert } from '@tuturuuu/icons';
import { getInventoryAnalytics } from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { AnalyticsInsights } from './analytics-insights';
import { AnalyticsObservability } from './analytics-observability';
import { AnalyticsCharts, AnalyticsKpis } from './analytics-visuals';
import { LoadingRows, StatePanel } from './operator-shell';

const ranges = ['7', '30', '90', '365'] as const;

export function InventoryAnalyticsClient({ wsId }: { wsId: string }) {
  const t = useTranslations('inventory.operator.analyticsCenter');
  const locale = useLocale();
  const [range, setRange] = useQueryState(
    'range',
    parseAsStringLiteral(ranges)
      .withDefault('30')
      .withOptions({ shallow: true })
  );
  const days = Number(range);
  const analytics = useQuery({
    placeholderData: (previous) => previous,
    queryFn: () => getInventoryAnalytics(wsId, { days }),
    queryKey: ['inventory', wsId, 'analytics', days],
    staleTime: 60_000,
  });
  const generatedAt = analytics.data?.generatedAt
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(analytics.data.generatedAt))
    : null;

  return (
    <main className="grid min-w-0 gap-3 sm:gap-5">
      <header className="grid min-w-0 gap-3 rounded-xl border bg-card p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:gap-4 sm:p-5">
        <div className="flex min-w-0 items-start gap-2.5 sm:gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary sm:h-10 sm:w-10">
            <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="font-semibold text-xl tracking-tight sm:text-3xl">
              {t('title')}
            </h1>
            <p className="mt-0.5 line-clamp-2 max-w-3xl text-muted-foreground text-xs leading-5 sm:mt-1 sm:line-clamp-none sm:text-sm sm:leading-6">
              {t('description')}
            </p>
          </div>
        </div>
        <div className="grid gap-2 sm:justify-items-end">
          <fieldset className="grid w-full grid-cols-4 rounded-lg border bg-muted/30 p-1 sm:w-auto">
            <legend className="sr-only">{t('rangeLabel')}</legend>
            {ranges.map((value) => (
              <Button
                className={cn(
                  'h-7 min-w-0 px-1.5 text-xs sm:h-8 sm:px-3',
                  range === value && 'bg-background shadow-sm'
                )}
                key={value}
                onClick={() => void setRange(value)}
                size="sm"
                type="button"
                variant="ghost"
              >
                {t('days', { count: Number(value) })}
              </Button>
            ))}
          </fieldset>
          <div className="flex min-w-0 items-center justify-between gap-2 text-[11px] text-muted-foreground sm:justify-end sm:text-xs">
            <span className="truncate">
              {generatedAt
                ? t('updatedAt', { date: generatedAt })
                : t('loading')}
            </span>
            <Button
              aria-label={t('refresh')}
              className="h-7 w-7 shrink-0 sm:h-8 sm:w-8"
              disabled={analytics.isFetching}
              onClick={() => void analytics.refetch()}
              size="icon"
              type="button"
              variant="ghost"
            >
              <RefreshCw
                className={cn(
                  'h-4 w-4',
                  analytics.isFetching && 'animate-spin'
                )}
              />
            </Button>
          </div>
        </div>
      </header>

      {analytics.isPending ? <LoadingRows /> : null}
      {analytics.isError ? (
        <StatePanel
          actionLabel={t('retry')}
          description={t('errorDescription')}
          onAction={() => void analytics.refetch()}
          title={t('errorTitle')}
          tone="danger"
        />
      ) : null}
      {analytics.data ? (
        <>
          <AnalyticsKpis data={analytics.data} />
          <AnalyticsObservability data={analytics.data} />
          <AnalyticsCharts data={analytics.data} />
          <AnalyticsInsights data={analytics.data} />
          <aside className="flex items-start gap-2 rounded-lg border bg-muted/20 p-3 text-muted-foreground text-xs leading-5">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t('estimateNotice')}</span>
          </aside>
        </>
      ) : null}
    </main>
  );
}
