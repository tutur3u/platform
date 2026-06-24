'use client';

import { BarChart3 } from '@tuturuuu/icons';
import { useTranslations } from 'use-intl';

interface RealtimeAnalyticsChartProps {
  data: Array<{ label: string; count: number }>;
  metric: 'requests' | 'users';
  isLoading?: boolean;
}

export function RealtimeAnalyticsChart({
  data,
  metric,
  isLoading,
}: RealtimeAnalyticsChartProps) {
  const t = useTranslations('realtime-analytics');

  if (isLoading) {
    return (
      <div className="flex h-64 w-full items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-dynamic-blue border-t-transparent" />
          <p className="mt-4 text-muted-foreground text-sm">
            {t('chart.loading')}
          </p>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex h-64 w-full items-center justify-center">
        <div className="space-y-2 text-center">
          <BarChart3 className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="font-medium text-foreground">{t('chart.no_data')}</p>
          <p className="text-muted-foreground text-sm">
            {t('chart.no_data_description')}
          </p>
        </div>
      </div>
    );
  }

  // Calculate stats
  const totalCount = data.reduce((sum, item) => sum + item.count, 0);
  const peakCount = Math.max(...data.map((item) => item.count));
  const peakLabel = data.find((item) => item.count === peakCount)?.label;
  const avgCount = totalCount > 0 ? Math.round(totalCount / data.length) : 0;
  const metricLabel =
    metric === 'requests' ? t('chart.requests_label') : t('chart.users_label');

  return (
    <div className="space-y-4">
      {/* Chart Container */}
      <div className="relative">
        <div className="h-80 w-full overflow-x-auto rounded-lg border bg-muted/20 p-4">
          <div className="flex h-full min-w-[640px] items-end gap-2">
            {data.map((item) => {
              const heightPercent =
                peakCount > 0 ? Math.max((item.count / peakCount) * 100, 2) : 2;

              return (
                <div
                  key={item.label}
                  className="flex h-full flex-1 flex-col items-center justify-end gap-2"
                  title={`${item.label}: ${item.count.toLocaleString()} ${metricLabel}`}
                >
                  <div className="flex h-full w-full items-end">
                    <div
                      className="w-full rounded-t bg-dynamic-blue transition-all"
                      style={{ height: `${heightPercent}%` }}
                    />
                  </div>
                  <span className="max-w-full truncate text-muted-foreground text-xs">
                    {item.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Peak Period Indicator */}
        {peakLabel && peakCount > 0 && (
          <div className="absolute top-2 right-2 rounded-lg bg-dynamic-blue/10 px-3 py-1.5 backdrop-blur-sm">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-dynamic-blue" />
              <span className="font-medium text-dynamic-blue text-xs">
                {t('stats.peak_hour')}: {peakLabel}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg bg-linear-to-br from-dynamic-blue/5 to-dynamic-blue/10 p-3 text-center">
          <div className="font-bold text-dynamic-blue text-lg">{peakCount}</div>
          <div className="text-muted-foreground text-xs">
            {t('stats.peak_hour')}
          </div>
        </div>
        <div className="rounded-lg bg-linear-to-br from-dynamic-green/5 to-dynamic-green/10 p-3 text-center">
          <div className="font-bold text-dynamic-green text-lg">{avgCount}</div>
          <div className="text-muted-foreground text-xs">
            {t('stats.avg_per_hour')}
          </div>
        </div>
        <div className="rounded-lg bg-linear-to-br from-dynamic-purple/5 to-dynamic-purple/10 p-3 text-center">
          <div className="font-bold text-dynamic-purple text-lg">
            {totalCount}
          </div>
          <div className="text-muted-foreground text-xs">
            {t('stats.total')}
          </div>
        </div>
      </div>
    </div>
  );
}
