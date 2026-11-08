'use client';

import { RefreshCw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { reportMonthLabel } from '@tuturuuu/users-core/features/reports/report-month';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/**
 * Sent reports with no send date, which no month includes. The list response
 * carries the count; it is null when the server could not read every stage.
 */
function undatedSentCount(page: object | undefined) {
  const count =
    page && 'undatedSentCount' in page ? page.undatedSentCount : null;
  return typeof count === 'number' && count > 0 ? count : 0;
}

/** What the worklist shows (a month, a range, or all periods) and Refresh. */
export function PeriodicReportsScopeHeader({
  month,
  onRefresh,
  page,
  periodEnd,
  periodStart,
}: {
  month: string | null;
  onRefresh: () => Promise<unknown>;
  /** First page of the current list response, when it is current. */
  page?: object;
  periodEnd: string;
  periodStart: string;
}) {
  const t = useTranslations('reports-hub');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const undatedSent = month ? undatedSentCount(page) : 0;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="space-y-1 text-muted-foreground text-xs">
        <p>
          {month
            ? t('month_scope', { month: reportMonthLabel(month) })
            : periodStart || periodEnd
              ? t('period_scope', {
                  start: periodStart || t('all_time_start'),
                  end: periodEnd || t('all_time_end'),
                })
              : t('all_periods')}
        </p>
        {undatedSent > 0 && (
          <p role="status">
            {t('undated_sent_notice', { count: undatedSent })}
          </p>
        )}
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
