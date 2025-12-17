'use client';

import {
  BarChart2,
  Brain,
  Clock,
  Edit,
  History,
  Layers,
  Move,
  RotateCcw,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { formatDuration } from '@/lib/time-format';
import type { SessionWithRelations } from '../../types';
import type { StackedSession } from './session-types';
import type { PeriodStats } from './session-utils';
import { getCategoryColor } from './session-utils';

interface MonthViewProps {
  periodStats: PeriodStats;
  sessionsForPeriod: SessionWithRelations[] | undefined;
  groupedStackedSessions: { [key: string]: StackedSession[] };
  onResume: (session: SessionWithRelations | undefined) => void;
  onEdit: (session: SessionWithRelations | undefined) => void;
  onMove: (session: SessionWithRelations | undefined) => void;
}

export function MonthView({
  periodStats,
  sessionsForPeriod,
  groupedStackedSessions,
  onResume,
  onEdit,
  onMove,
}: MonthViewProps) {
  const t = useTranslations('time-tracker.session_history');

  return (
    <div className="space-y-6">
      {/* Month Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border bg-linear-to-br from-blue-50 to-blue-100 p-4 dark:from-blue-950/50 dark:to-blue-900/50">
          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
            <Clock className="h-4 w-4" />
            <span className="font-medium text-sm">{t('total_time')}</span>
          </div>
          <p className="mt-1 font-bold text-2xl text-blue-900 dark:text-blue-100">
            {formatDuration(periodStats?.totalDuration)}
          </p>
        </div>

        <div className="rounded-lg border bg-linear-to-br from-green-50 to-green-100 p-4 dark:from-green-950/50 dark:to-green-900/50">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
            <Layers className="h-4 w-4" />
            <span className="font-medium text-sm">{t('activities')}</span>
          </div>
          <p className="mt-1 font-bold text-2xl text-green-900 dark:text-green-100">
            {periodStats?.breakdown.length}
          </p>
        </div>

        <div className="rounded-lg border bg-linear-to-br from-purple-50 to-purple-100 p-4 dark:from-purple-950/50 dark:to-purple-900/50">
          <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300">
            <BarChart2 className="h-4 w-4" />
            <span className="font-medium text-sm">{t('sessions')}</span>
          </div>
          <p className="mt-1 font-bold text-2xl text-purple-900 dark:text-purple-100">
            {sessionsForPeriod?.length}
          </p>
        </div>
      </div>

      {/* Productivity Insights */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border p-4">
          <h3 className="mb-4 flex items-center gap-2 font-semibold text-base">
            <BarChart2 className="h-5 w-5" />
            {t('top_activities_this_month')}
          </h3>
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
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            'h-3 w-3 rounded-full',
                            getCategoryColor(cat.color)
                          )}
                        />
                        <span className="font-medium">{cat.name}</span>
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
        </div>

        <div className="rounded-lg border p-4">
          <h3 className="mb-4 flex items-center gap-2 font-semibold text-base">
            <Brain className="h-5 w-5" />
            {t('productivity_insights')}
          </h3>
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
                  <div className="font-bold text-green-600">
                    {periodStats?.longSessions}
                  </div>
                  <div className="text-muted-foreground">{t('deep')}</div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-blue-600">
                    {periodStats?.mediumSessions}
                  </div>
                  <div className="text-muted-foreground">{t('focus')}</div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-orange-600">
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
                <div className="font-medium text-sm">
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
            // Extract week start dates from keys like "Week Dec 15 - Dec 21"
            // Parse the date after "Week " and before " -"
            const extractDate = (key: string) => {
              const match = key.match(/Week (\w+ \d+)/);
              if (match) {
                // Convert "Dec 15" to a date for comparison
                return new Date(`${match[1]}, ${new Date().getFullYear()}`);
              }
              return new Date(0); // fallback
            };
            return extractDate(keyB).getTime() - extractDate(keyA).getTime(); // Descending order
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
                <div className="mb-4 flex items-center justify-between">
                  <h4 className="font-medium text-foreground">{groupTitle}</h4>
                  <div className="flex items-center gap-3 text-muted-foreground text-sm">
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
                          <h5 className="truncate font-medium text-sm">
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
          }
        )}
      </div>
    </div>
  );
}
