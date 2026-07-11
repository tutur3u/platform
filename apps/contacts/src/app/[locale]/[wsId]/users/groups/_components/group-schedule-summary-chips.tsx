'use client';

import type { WorkspaceUserGroupScheduleGroupSummary } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useLocale, useTranslations } from 'next-intl';
import { formatSchedulePatternChip } from './grouped-session-timeblock-utils';

interface GroupScheduleSummaryChipsProps {
  isLoading?: boolean;
  summary?: WorkspaceUserGroupScheduleGroupSummary;
}

export function GroupScheduleSummaryChips({
  isLoading,
  summary,
}: GroupScheduleSummaryChipsProps) {
  const t = useTranslations('ws-user-group-schedule');
  const locale = useLocale();

  if (isLoading && !summary) {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-5 w-20" />
      </div>
    );
  }

  if (!summary) return null;

  const visiblePatterns = summary.patterns.slice(0, 2);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {visiblePatterns.length > 0 ? (
        visiblePatterns.map((pattern) => (
          <Badge
            className="max-w-full rounded-sm px-1.5 py-0 font-normal text-xs"
            key={`${pattern.startTime}-${pattern.endTime}-${pattern.daysOfWeek.join('-')}`}
            variant="secondary"
          >
            <span className="truncate">
              {formatSchedulePatternChip(pattern, locale)}
            </span>
          </Badge>
        ))
      ) : (
        <Badge
          className="rounded-sm px-1.5 py-0 font-normal text-xs"
          variant="outline"
        >
          {summary.upcomingCount > 0
            ? t('schedule_upcoming_count', { count: summary.upcomingCount })
            : t('schedule_no_upcoming')}
        </Badge>
      )}
      {summary.exceptionCount > 0 && (
        <Badge
          className="rounded-sm px-1.5 py-0 font-normal text-xs"
          variant="outline"
        >
          {t('schedule_exception_count', { count: summary.exceptionCount })}
        </Badge>
      )}
    </div>
  );
}
