'use client';

import { BarChart2, Loader2 } from '@tuturuuu/icons';
import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { formatDuration } from '@/lib/time-format';
import type { PeriodStats } from '@/lib/time-tracker-utils';
import { getCategoryColor } from './session-utils';

interface SessionStatsProps {
  periodStats: PeriodStats;
  isLoading?: boolean;
}

export function SessionStats({ periodStats, isLoading }: SessionStatsProps) {
  const t = useTranslations('time-tracker.session_history');

  if (isLoading) {
    return (
      <div className="mb-6 flex min-h-[200px] items-center justify-center rounded-lg border p-4">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-lg border p-4">
      <h3 className="mb-3 flex items-center gap-2 font-medium text-muted-foreground text-sm">
        <BarChart2 className="h-4 w-4" />
        {t('summary')}
      </h3>
      <div className="space-y-4">
        <div>
          <div className="mb-1 flex justify-between text-sm">
            <span className="font-medium">{t('total_time')}</span>
            <span className="font-bold">
              {formatDuration(periodStats?.totalDuration)}
            </span>
          </div>
          <Progress value={100} className="h-2" />
        </div>
        {periodStats?.breakdown.map((cat) => {
          const percentage =
            (periodStats?.totalDuration || 0) > 0
              ? (cat.duration / (periodStats?.totalDuration || 1)) * 100
              : 0;
          return (
            <div key={cat.name}>
              <div className="mb-1 flex justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'h-2 w-2 rounded-full',
                      getCategoryColor(cat.color)
                    )}
                  />
                  <span>{cat.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-10 text-right text-muted-foreground text-xs">
                    {percentage.toFixed(0)}%
                  </span>
                  <span className="font-medium">
                    {formatDuration(cat.duration)}
                  </span>
                </div>
              </div>
              <Progress
                value={percentage}
                className="h-2"
                indicatorClassName={getCategoryColor(cat.color)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
