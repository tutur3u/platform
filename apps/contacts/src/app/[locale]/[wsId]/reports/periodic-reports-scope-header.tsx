'use client';

import { RefreshCw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { reportMonthLabel } from '@tuturuuu/users-core/features/reports/report-month';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/** What the worklist shows (a month, a range, or all periods) and Refresh. */
export function PeriodicReportsScopeHeader({
  month,
  onRefresh,
  periodEnd,
  periodStart,
}: {
  month: string | null;
  onRefresh: () => Promise<unknown>;
  periodEnd: string;
  periodStart: string;
}) {
  const t = useTranslations('reports-hub');
  const [isRefreshing, setIsRefreshing] = useState(false);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-muted-foreground text-xs">
        {month
          ? t('month_scope', { month: reportMonthLabel(month) })
          : periodStart || periodEnd
            ? t('period_scope', {
                start: periodStart || t('all_time_start'),
                end: periodEnd || t('all_time_end'),
              })
            : t('all_periods')}
      </p>
      <Button
        size="icon"
        className="size-8"
        variant="ghost"
        aria-label={t('refresh')}
        title={t('refresh')}
        disabled={isRefreshing}
        onClick={async () => {
          setIsRefreshing(true);
          try {
            await onRefresh();
          } finally {
            setIsRefreshing(false);
          }
        }}
      >
        <RefreshCw
          className={`size-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
        />
      </Button>
    </div>
  );
}
