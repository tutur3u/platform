'use client';

import {
  BarChart2,
  Brain,
  Clock,
  Edit,
  History,
  Layers,
  Loader2,
  Move,
  RotateCcw,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import { useTranslations } from 'next-intl';
import { formatDuration } from '@/lib/time-format';
import type { PeriodStats } from '@/lib/time-tracker-utils';
import type { SessionWithRelations } from '../../types';
import type { StackedSession } from './session-types';
import { getCategoryColor } from './session-utils';

interface MonthViewProps {
  periodStats: PeriodStats;
  isLoadingStats?: boolean;
  groupedStackedSessions: { [key: string]: StackedSession[] };
  startOfPeriod: dayjs.Dayjs;
  onResume: (session: SessionWithRelations | undefined) => void;
  onEdit: (session: SessionWithRelations | undefined) => void;
  onMove: (session: SessionWithRelations | undefined) => void;
}

export function MonthView({
  periodStats,
  isLoadingStats,
  groupedStackedSessions,
  startOfPeriod,
  onResume,
  onEdit,
  onMove,
}: MonthViewProps) {
  const t = useTranslations('time-tracker.session_history');

  const sessionColor = {
    long: 'text-dynamic-green',
    medium: 'text-dynamic-blue',
    short: 'text-dynamic-orange',
  };

  return (
    <div className="space-y-6">
      {/* Month Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border bg-linear-to-br from-dynamic-blue/10 to-dynamic-blue/20 p-4 dark:from-dynamic-blue/10 dark:to-dynamic-blue/20">
          <div className="flex items-center gap-2 text-dynamic-blue">
            <Clock className="h-4 w-4" />
            <span className="font-medium text-sm">{t('total_time')}</span>
          </div>
          {isLoadingStats ? (
            <Loader2 className="mt-2 h-6 w-6 animate-spin" />
          ) : (
            <p className="mt-1 font-bold text-2xl text-dynamic-blue">
              {formatDuration(periodStats?.totalDuration)}
            </p>
          )}
        </div>

        <div className="rounded-lg border bg-linear-to-br from-dynamic-green/10 to-dynamic-green/20 p-4 dark:from-dynamic-green/10 dark:to-dynamic-green/20">
          <div className="flex items-center gap-2 text-dynamic-green">
            <Layers className="h-4 w-4" />
            <span className="font-medium text-sm">{t('activities')}</span>
          </div>
          {isLoadingStats ? (
            <Loader2 className="mt-2 h-6 w-6 animate-spin" />
          ) : (
            <p className="mt-1 font-bold text-2xl text-dynamic-green">
              {periodStats?.breakdown.length}
            </p>
          )}
        </div>

        <div className="rounded-lg border bg-linear-to-br from-dynamic-purple/10 to-dynamic-purple/20 p-4 dark:from-dynamic-purple/10 dark:to-dynamic-purple/20">
          <div className="flex items-center gap-2 text-dynamic-purple">
            <BarChart2 className="h-4 w-4" />
            <span className="font-medium text-sm">{t('sessions')}</span>
          </div>
          {isLoadingStats ? (
            <Loader2 className="mt-2 h-6 w-6 animate-spin" />
          ) : (
            <p className="mt-1 font-bold text-2xl text-dynamic-purple">
              {periodStats?.sessionCount}
            </p>
          )}
        </div>
      </div>

      {/* Productivity Insights */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border p-4">
          <h3 className="mb-4 flex items-center gap-2 font-semibold text-base">
            <BarChart2 className="h-5 w-5" />
            {t('top_activities_this_month')}
          </h3>
          {isLoadingStats ? (
            <div className="flex h-[200px] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3">
              {periodStats?.breakdown.slice(0, 5).map((cat, index) => {
                const percentage =
                  (periodStats?.totalDuration || 0) > 0
                    ? (cat.duration / (periodStats?.totalDuration || 1)) * 100
                    : 0;
                return (
                  <div key={cat.name} className="group">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted font-medium text-xs">
                          {index + 1}
                        </div>
                        <div className="flex min-w-0 items-center gap-2">
                          <div
                            className={cn(
                              'h-3 w-3 shrink-0 rounded-full',
                              getCategoryColor(cat.color)
                            )}
                          />
                          <span className="truncate font-medium">
                            {cat.name}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground text-sm">
                          {percentage.toFixed(1)}%
                        </span>
                        <span className="min-w-16 text-right font-semibold">
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
          )}
        </div>

        <div className="rounded-lg border p-4">
          <h3 className="mb-4 flex items-center gap-2 font-semibold text-base">
            <Brain className="h-5 w-5" />
            {t('productivity_insights')}
          </h3>
          {isLoadingStats ? (
            <div className="flex h-[200px] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Best Time of Day */}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">
                  {t('most_productive_time')}
                </span>
                <span className="font-medium">
                  {periodStats?.bestTimeOfDay === 'morning' && t('morning')}
                  {periodStats?.bestTimeOfDay === 'afternoon' && t('afternoon')}
                  {periodStats?.bestTimeOfDay === 'evening' && t('evening')}
                  {periodStats?.bestTimeOfDay === 'night' && t('night')}
                </span>
              </div>

              {/* Session Types Breakdown */}
              <div className="space-y-2">
                <div className="text-muted-foreground text-sm">
                  {t('session_types')}
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="text-center">
                    <div className={cn('font-bold', sessionColor.long)}>
                      {periodStats?.longSessions}
                    </div>
                    <div className="text-muted-foreground">{t('deep')}</div>
                  </div>
                  <div className="text-center">
                    <div className={cn('font-bold', sessionColor.medium)}>
                      {periodStats?.mediumSessions}
                    </div>
                    <div className="text-muted-foreground">{t('focus')}</div>
                  </div>
                  <div className="text-center">
                    <div className={cn('font-bold', sessionColor.short)}>
                      {periodStats?.shortSessions}
                    </div>
                    <div className="text-muted-foreground">{t('quick')}</div>
                  </div>
                </div>
              </div>

              {/* Longest Session Highlight */}
              {periodStats?.longestSession && (
                <div className="rounded-md bg-muted/30 p-3">
                  <div className="mb-1 text-muted-foreground text-xs">
                    {t('longest_session')}
                  </div>
                  <div className="line-clamp-2 break-all font-medium text-sm">
                    {periodStats?.longestSession.title}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {formatDuration(
                      periodStats?.longestSession.duration_seconds || 0
                    )}{' '}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Weekly Breakdown */}
      <div className="space-y-4">
        <h3 className="flex items-center gap-2 font-semibold text-base">
          <History className="h-5 w-5" />
          {t('weekly_breakdown')}
        </h3>
        {Object.entries(groupedStackedSessions)
          .sort(([keyA], [keyB]) => {
            const extractDate = (key: string) => {
              const match = key.match(/Week (\w+ \d+)/);
              if (match) {
                const dateStr = match[1];
                let year = startOfPeriod.year();
                const parsedDate = dayjs(dateStr, 'MMM D');
                if (!parsedDate.isValid()) {
                  return new Date(0);
                }

                const extractedMonthNum = parsedDate.month();
                const periodMonthNum = startOfPeriod.month();

                if (
                  extractedMonthNum > periodMonthNum &&
                  periodMonthNum === 0
                ) {
                  year -= 1;
                } else if (
                  extractedMonthNum < periodMonthNum &&
                  periodMonthNum === 11
                ) {
                  year += 1;
                }

                return dayjs(
                  `${year}-${(extractedMonthNum + 1).toString().padStart(2, '0')}-${parsedDate.date().toString().padStart(2, '0')}`
                ).toDate();
              }
              return new Date(0);
            };
            return extractDate(keyB).getTime() - extractDate(keyA).getTime();
          })
          .map(([groupTitle, groupSessions]) => {
            const groupTotalDuration = groupSessions.reduce(
              (sum, session) => sum + session.periodDuration,
              0
            );

            return (
              <div
                key={groupTitle}
                className="rounded-lg border bg-muted/30 p-4"
              >
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h4 className="truncate font-medium text-foreground">
                    {groupTitle}
                  </h4>
                  <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm sm:gap-3">
                    <span>
                      {t('activities_count', {
                        count: groupSessions.length,
                      })}
                    </span>
                    <span>•</span>
                    <span className="font-semibold text-foreground">
                      {formatDuration(groupTotalDuration)}
                    </span>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {groupSessions.map((session) => (
                    <div
                      key={session.id}
                      className="rounded-md border bg-background p-3 transition-all hover:shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h5 className="line-clamp-1 break-all font-medium text-sm">
                            {session.title}
                          </h5>
                          <div className="mt-1 flex items-center gap-2">
                            {session.category && (
                              <div className="flex items-center gap-1">
                                <div
                                  className={cn(
                                    'h-2 w-2 rounded-full',
                                    getCategoryColor(
                                      session.category.color || 'BLUE'
                                    )
                                  )}
                                />
                                <span className="text-muted-foreground text-xs">
                                  {session.category.name}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-sm">
                            {formatDuration(session.periodDuration)}
                          </div>
                          {session.sessions.length > 1 && (
                            <div className="text-muted-foreground text-xs">
                              {t('sessions_count_label', {
                                count: session.sessions.length,
                              })}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 flex-1 text-xs"
                          onClick={() =>
                            onResume(
                              session.sessions[session.sessions.length - 1]
                            )
                          }
                        >
                          <RotateCcw className="mr-1 h-3 w-3" />
                          {t('resume')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() =>
                            onEdit(
                              session.sessions[session.sessions.length - 1]
                            )
                          }
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() =>
                            onMove(
                              session.sessions[session.sessions.length - 1]
                            )
                          }
                        >
                          <Move className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
