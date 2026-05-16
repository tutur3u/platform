'use client';

import { ChevronLeft, ChevronRight, CircleHelp } from '@tuturuuu/icons';
import type { TeachAttendanceDaySummary } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import {
  getCalendarGrid,
  getDayTone,
  isInCourseDateRange,
  sessionsForDate,
  toIsoDate,
} from './attendance-utils';

export function AttendanceCalendar({
  date,
  endingDate,
  memberCount,
  monthDate,
  onDateChange,
  onMonthChange,
  sessions,
  startingDate,
  summaries,
}: {
  date: string;
  endingDate?: string | null;
  memberCount: number;
  monthDate: Date;
  onDateChange: (date: string) => void;
  onMonthChange: (date: Date) => void;
  sessions: string[];
  startingDate?: string | null;
  summaries: TeachAttendanceDaySummary[];
}) {
  const locale = useLocale();
  const t = useTranslations('teachOperations');
  const days = getCalendarGrid(monthDate);
  const summaryByDate = new Map(
    summaries.map((summary) => [summary.date, summary])
  );
  const weekdays = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(2026, 0, 5 + index);
    return day.toLocaleDateString(locale, { weekday: 'short' });
  });

  const changeMonth = (offset: number) => {
    onMonthChange(
      new Date(monthDate.getFullYear(), monthDate.getMonth() + offset, 1)
    );
  };

  return (
    <TooltipProvider>
      <section className="space-y-4 border-2 border-border bg-card p-4 shadow-[4px_4px_0_var(--border)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 font-black text-lg">
              {monthDate.toLocaleDateString(locale, {
                month: 'long',
                year: 'numeric',
              })}
              <Tooltip>
                <TooltipTrigger asChild>
                  <CircleHelp className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-64">
                  {t('calendarHelp')}
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="text-muted-foreground text-xs">
              {t('scheduledSessions', { count: sessions.length })}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => changeMonth(-1)}
              size="icon"
              variant="outline"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              onClick={() => changeMonth(1)}
              size="icon"
              variant="outline"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {weekdays.map((weekday) => (
            <div className="bg-muted px-1 py-2 font-black" key={weekday}>
              {weekday}
            </div>
          ))}
          {days.map((day) => {
            const isoDate = toIsoDate(day);
            const inMonth = day.getMonth() === monthDate.getMonth();
            const inRange = isInCourseDateRange(day, startingDate, endingDate);
            const daySessions = sessionsForDate(sessions, isoDate);
            const scheduled = inMonth && inRange && daySessions.length > 0;
            const summary = summaryByDate.get(isoDate);
            const selected = isoDate === date;
            const tone = getDayTone(summary, scheduled, memberCount);

            if (!inMonth) {
              return <div aria-hidden className="min-h-14" key={isoDate} />;
            }

            const label = scheduled
              ? summary
                ? t('dayTooltipWithCounts', {
                    absent: summary.absent,
                    late: summary.late,
                    notes: summary.notes,
                    present: summary.present,
                    total: memberCount,
                  })
                : t('dayTooltipScheduled')
              : inRange
                ? t('dayTooltipNoClass')
                : t('dayTooltipOutsideTerm');

            return (
              <Tooltip key={isoDate}>
                <TooltipTrigger asChild>
                  <button
                    className={cn(
                      'min-h-14 border-2 bg-background p-1 text-left transition',
                      selected
                        ? 'border-primary shadow-[2px_2px_0_var(--border)]'
                        : 'border-border/60',
                      !scheduled && 'text-muted-foreground/45',
                      scheduled && 'hover:-translate-y-0.5 hover:bg-muted',
                      tone === 'scheduled' &&
                        'border-dynamic-yellow/40 bg-dynamic-yellow/10',
                      tone === 'partial' &&
                        'border-dynamic-blue/40 bg-dynamic-blue/10',
                      tone === 'complete' &&
                        'border-dynamic-green/40 bg-dynamic-green/10',
                      tone === 'late' &&
                        'border-dynamic-orange/40 bg-dynamic-orange/10',
                      tone === 'absent' &&
                        'border-dynamic-red/40 bg-dynamic-red/10'
                    )}
                    onClick={() => {
                      if (scheduled) onDateChange(isoDate);
                    }}
                    type="button"
                  >
                    <span className="font-black">{day.getDate()}</span>
                    {scheduled ? (
                      <span
                        className={cn(
                          'mt-3 block h-1.5 w-8 rounded-full',
                          tone === 'scheduled' && 'bg-dynamic-yellow',
                          tone === 'partial' && 'bg-dynamic-blue',
                          tone === 'complete' && 'bg-dynamic-green',
                          tone === 'late' && 'bg-dynamic-orange',
                          tone === 'absent' && 'bg-dynamic-red'
                        )}
                      />
                    ) : null}
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-64">
                  <div className="space-y-1">
                    <p className="font-bold">{label}</p>
                    {scheduled ? (
                      <p className="text-muted-foreground text-xs">
                        {t('sessionCount', { count: daySessions.length })}
                      </p>
                    ) : null}
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
          {(
            ['scheduled', 'partial', 'complete', 'late', 'absent'] as const
          ).map((tone) => (
            <div className="flex items-center gap-2" key={tone}>
              <span
                className={cn(
                  'h-2.5 w-2.5 rounded-full',
                  tone === 'scheduled' && 'bg-dynamic-yellow',
                  tone === 'partial' && 'bg-dynamic-blue',
                  tone === 'complete' && 'bg-dynamic-green',
                  tone === 'late' && 'bg-dynamic-orange',
                  tone === 'absent' && 'bg-dynamic-red'
                )}
              />
              <span className="text-muted-foreground">
                {t(`calendarTone.${tone}`)}
              </span>
            </div>
          ))}
        </div>
      </section>
    </TooltipProvider>
  );
}
