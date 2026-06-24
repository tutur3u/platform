'use client';

import { GitBranch, Radio, SquareStack, TriangleAlert } from '@tuturuuu/icons';
import { SummaryMetricCard } from '../monitoring-requests/archive-primitives';
import { formatCompactNumber } from './formatters';
import type { WatcherLogsTranslations } from './types';

export function WatcherLogMetrics({
  errorLogCount,
  failedRolloutCount,
  retainedLogCount,
  t,
  warningLogCount,
}: {
  errorLogCount: number;
  failedRolloutCount: number;
  retainedLogCount: number;
  t: WatcherLogsTranslations;
  warningLogCount: number;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <SummaryMetricCard
        icon={<SquareStack className="h-4 w-4" />}
        label={t('logs_page.cards.retained')}
        meta={t('logs_page.cards.retained_description')}
        value={formatCompactNumber(retainedLogCount)}
      />
      <SummaryMetricCard
        icon={<TriangleAlert className="h-4 w-4" />}
        label={t('explorer.error_entries')}
        meta={t('logs_page.cards.error_description')}
        value={formatCompactNumber(errorLogCount)}
      />
      <SummaryMetricCard
        icon={<Radio className="h-4 w-4" />}
        label={t('explorer.warning_entries')}
        meta={t('explorer.warning_hint')}
        value={formatCompactNumber(warningLogCount)}
      />
      <SummaryMetricCard
        icon={<GitBranch className="h-4 w-4" />}
        label={t('explorer.failed_rollouts')}
        meta={t('explorer.failed_rollouts_hint')}
        value={formatCompactNumber(failedRolloutCount)}
      />
    </div>
  );
}
