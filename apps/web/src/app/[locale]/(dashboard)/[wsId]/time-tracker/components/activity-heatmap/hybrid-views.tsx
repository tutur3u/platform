'use client';

import '@/lib/dayjs-setup';
import { formatDuration } from '@tuturuuu/hooks/utils/time-format';
import { ChevronLeft, ChevronRight } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import type { Dayjs } from 'dayjs';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type { ActivityDay } from './types';
import {
  getColorClass,
  getIntensity,
  normalizeActivityDateKey,
  parseActivityDate,
} from './utils';

interface YearOverviewProps {
  dailyActivity: ActivityDay[];
  today: Dayjs;
  userTimezone: string;
  onSelectMonth: (month: Dayjs) => void;
}

export function YearOverview({
  dailyActivity,
  today,
  userTimezone,
  onSelectMonth,
}: YearOverviewProps) {
  const t = useTranslations('time-tracker.heatmap');
  const locale = useLocale();

  const { activeDayCount, monthlyData } = useMemo(() => {
    const monthAggregates = new Map<
      string,
      { totalDuration: number; totalSessions: number; activeDays: number }
    >();
    const yearStart = today.startOf('year');
    const yearEnd = yearStart.endOf('year');
    let yearActiveDays = 0;

    dailyActivity.forEach((day) => {
      const dayDate = parseActivityDate(day.date, userTimezone);

      if (
        dayDate.isBefore(yearStart, 'day') ||
        dayDate.isAfter(yearEnd, 'day')
      ) {
        return;
      }

      const isActiveDay = day.duration > 0;
      const monthKey = dayDate.format('YYYY-MM');
      const existing = monthAggregates.get(monthKey) ?? {
        totalDuration: 0,
        totalSessions: 0,
        activeDays: 0,
      };

      monthAggregates.set(monthKey, {
        totalDuration: existing.totalDuration + day.duration,
        totalSessions: existing.totalSessions + day.sessions,
        activeDays: existing.activeDays + (isActiveDay ? 1 : 0),
      });

      if (isActiveDay) {
        yearActiveDays += 1;
      }
    });

    return {
      activeDayCount: yearActiveDays,
      monthlyData: Array.from({ length: 12 }, (_, monthIndex) => {
        const monthStart = today.startOf('year').add(monthIndex, 'month');
        const monthKey = monthStart.format('YYYY-MM');
        const aggregate = monthAggregates.get(monthKey) ?? {
          totalDuration: 0,
          totalSessions: 0,
          activeDays: 0,
        };

        const avgDuration =
          aggregate.activeDays > 0
            ? aggregate.totalDuration / aggregate.activeDays
            : 0;

        return {
          month: monthStart,
          duration: aggregate.totalDuration,
          sessions: aggregate.totalSessions,
          intensity: getIntensity(avgDuration),
        };
      }),
    };
  }, [dailyActivity, today, userTimezone]);

  const shortMonthFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: 'short' }),
    [locale]
  );

  const longMonthFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }),
    [locale]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-dynamic-foreground text-sm">
          {t('yearActivityPattern', { year: today.format('YYYY') })}
        </h4>
        <span className="text-dynamic-muted-foreground text-xs">
          {t('activeDays', { count: activeDayCount })}
        </span>
      </div>

      <div className="grid grid-cols-12 gap-2">
        {monthlyData.map((month) => (
          <Tooltip key={month.month.format('YYYY-MM')}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex h-12 flex-col items-center justify-center rounded-md font-medium text-xs transition-all hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dynamic-accent/50',
                  getColorClass(month.intensity),
                  'text-dynamic-foreground'
                )}
                onClick={() => onSelectMonth(month.month)}
                aria-label={longMonthFormatter.format(month.month.toDate())}
              >
                <span className="text-[10px] opacity-60">
                  {shortMonthFormatter.format(month.month.toDate())}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>
              <div className="text-center">
                <div className="font-medium">
                  {longMonthFormatter.format(month.month.toDate())}
                </div>
                <div className="text-dynamic-muted-foreground text-sm">
                  {formatDuration(month.duration)} •{' '}
                  {t('sessions', { count: month.sessions })}
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

interface MonthlyCalendarViewProps {
  currentMonth: Dayjs;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  dailyActivity: ActivityDay[];
  userTimezone: string;
  today: Dayjs;
  timeReference: 'relative' | 'absolute' | 'smart';
  navigateToHistoryDay: (value: string | Dayjs) => void;
}

export function MonthlyCalendarView({
  currentMonth,
  onPrevMonth,
  onNextMonth,
  dailyActivity,
  userTimezone,
  today,
  timeReference,
  navigateToHistoryDay,
}: MonthlyCalendarViewProps) {
  const t = useTranslations('time-tracker.heatmap');
  const locale = useLocale();

  const activityByDate = useMemo(() => {
    const map = new Map<string, ActivityDay>();
    dailyActivity.forEach((activity) => {
      map.set(normalizeActivityDateKey(activity.date, userTimezone), activity);
    });
    return map;
  }, [dailyActivity, userTimezone]);

  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }),
    [locale]
  );

  const fullDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
    [locale]
  );

  const monthStart = currentMonth.startOf('month');
  const monthEnd = currentMonth.endOf('month');
  const calendarStart = monthStart.startOf('isoWeek');
  const calendarEnd = monthEnd.endOf('isoWeek');

  const days: Array<{
    date: Dayjs;
    activity: ActivityDay | null;
    isCurrentMonth: boolean;
    isToday: boolean;
  }> = [];

  let currentDay = calendarStart;
  while (
    currentDay.isBefore(calendarEnd) ||
    currentDay.isSame(calendarEnd, 'day')
  ) {
    const dayActivity = activityByDate.get(currentDay.format('YYYY-MM-DD'));

    days.push({
      date: currentDay,
      activity: dayActivity ?? null,
      isCurrentMonth: currentDay.isSame(currentMonth, 'month'),
      isToday: currentDay.isSame(today, 'day'),
    });

    currentDay = currentDay.add(1, 'day');
  }

  const monthlyStats = {
    activeDays: days.filter((day) => day.activity && day.isCurrentMonth).length,
    totalDuration: days
      .filter((day) => day.isCurrentMonth && day.activity)
      .reduce((sum, day) => sum + (day.activity?.duration ?? 0), 0),
    totalSessions: days
      .filter((day) => day.isCurrentMonth && day.activity)
      .reduce((sum, day) => sum + (day.activity?.sessions ?? 0), 0),
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h4 className="font-semibold text-base text-dynamic-foreground">
            {monthFormatter.format(currentMonth.toDate())}
          </h4>
          <div className="flex items-center gap-3 text-dynamic-muted-foreground text-xs">
            <span>{t('activeDays', { count: monthlyStats.activeDays })}</span>
            <span>
              {t('trackedDuration', {
                duration: formatDuration(monthlyStats.totalDuration),
              })}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            type="button"
            onClick={onPrevMonth}
            className="h-7 w-7"
            aria-label={t('aria.previousMonth', {
              month: monthFormatter.format(
                currentMonth.subtract(1, 'month').toDate()
              ),
            })}
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            type="button"
            onClick={onNextMonth}
            className="h-7 w-7"
            aria-label={t('aria.nextMonth', {
              month: monthFormatter.format(
                currentMonth.add(1, 'month').toDate()
              ),
            })}
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-7 gap-1.5 text-center font-medium text-dynamic-muted-foreground text-xs">
          {[
            t('days.mon'),
            t('days.tue'),
            t('days.wed'),
            t('days.thu'),
            t('days.fri'),
            t('days.sat'),
            t('days.sun'),
          ].map((day) => (
            <div key={day} className="py-1 text-center">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {days.map((day) => {
            const intensity = getIntensity(day.activity?.duration ?? 0);

            return (
              <Tooltip key={day.date.format('YYYY-MM-DD')}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => navigateToHistoryDay(day.date)}
                    className={cn(
                      'relative flex h-8 w-full items-center justify-center rounded-md font-medium text-xs transition-all focus-visible:outline-none',
                      'hover:z-10 hover:scale-105 focus-visible:z-10 focus-visible:scale-105 focus-visible:ring-2 focus-visible:ring-dynamic-accent/50',
                      day.isCurrentMonth
                        ? 'text-dynamic-foreground'
                        : 'text-dynamic-muted-foreground/60',
                      day.activity
                        ? getColorClass(intensity)
                        : `${getColorClass(0)} hover:opacity-90`,
                      day.isToday &&
                        'ring-(--heatmap-level-4) ring-2 ring-offset-1 ring-offset-background'
                    )}
                    aria-label={fullDateFormatter.format(day.date.toDate())}
                  >
                    {day.date.format('D')}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={4}>
                  <div className="space-y-1">
                    <div className="font-medium">
                      {day.date.format('dddd, DD/MM/YYYY')}
                      {timeReference === 'smart' && (
                        <div className="text-dynamic-muted-foreground text-xs">
                          {day.date.fromNow()}
                        </div>
                      )}
                    </div>
                    {day.activity ? (
                      <div className="text-dynamic-foreground text-sm">
                        {formatDuration(day.activity.duration)} •{' '}
                        {t('sessions', { count: day.activity.sessions })}
                      </div>
                    ) : (
                      <div className="text-dynamic-muted-foreground text-sm">
                        {t('noActivityRecorded')}
                      </div>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>
    </div>
  );
}
