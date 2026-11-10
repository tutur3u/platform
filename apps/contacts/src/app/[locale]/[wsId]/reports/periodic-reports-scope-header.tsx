'use client';

import { RefreshCw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { NO_TITLE_MONTH } from '@tuturuuu/users-core/features/reports/report-title-month';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { reportTitleMonthLabel } from './report-title-month-select';

/** What the worklist shows (a title month, a range, or all) and Refresh. */
export function PeriodicReportsScopeHeader({
  onRefresh,
  periodEnd,
  periodStart,
  titleMonth,
}: {
  onRefresh: () => Promise<unknown>;
  periodEnd: string;
  periodStart: string;
  /** Month named in the report title (`YYYY-MM`, `MM`, `none`) or empty. */
  titleMonth: string;
}) {
  const t = useTranslations('reports-hub');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const range =
    periodStart || periodEnd
      ? t('period_scope', {
          start: periodStart || t('all_time_start'),
          end: periodEnd || t('all_time_end'),
        })
      : null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="space-y-1 text-muted-foreground text-xs">
        <p>
          {titleMonth === NO_TITLE_MONTH
            ? t('title_month_scope_none')
            : titleMonth
              ? t('title_month_scope', {
                  month: reportTitleMonthLabel(titleMonth, {
                    month: (month) => t('month_option', { month }),
                    none: t('no_title_month'),
                  }),
                })
              : (range ?? t('all_periods'))}
        </p>
        {titleMonth && range && <p>{range}</p>}
      </div>
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
