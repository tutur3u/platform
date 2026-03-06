'use client';

import { formatDuration } from '@tuturuuu/hooks/utils/time-format';
import { ChevronLeft, ChevronRight } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useTranslations } from 'next-intl';
import type { ActivityDay } from './types';
import { getColorClass, getIntensity } from './utils';

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

  const monthlyData = Array.from({ length: 12 }, (_, monthIndex) => {
    const monthStart = today.startOf('year').add(monthIndex, 'month');
    const monthEnd = monthStart.endOf('month');

    const monthActivity = dailyActivity.filter((day) => {
      const dayDate = dayjs.utc(day.date).tz(userTimezone);
      return dayDate.isBetween(monthStart, monthEnd, 'day', '[]');
    });

    const totalDuration = monthActivity.reduce(
      (sum, day) => sum + day.duration,
      0
    );
    const totalSessions = monthActivity.reduce(
      (sum, day) => sum + day.sessions,
      0
    );
    const avgDuration =
      monthActivity.length > 0 ? totalDuration / monthActivity.length : 0;

    return {
      month: monthStart,
      duration: totalDuration,
      sessions: totalSessions,
      intensity: getIntensity(avgDuration),
    };
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-gray-700 text-sm dark:text-gray-300">
          {t('yearActivityPattern', { year: today.format('YYYY') })}
        </h4>
        <span className="text-gray-500 text-xs dark:text-gray-400">
          {t('activeDays', { count: dailyActivity.length })}
        </span>
      </div>

      <div className="grid grid-cols-12 gap-2">
        {monthlyData.map((month) => (
          <Tooltip key={month.month.format('YYYY-MM')}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={cn(
                  'h-12 rounded-md transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-emerald-400/50',
                  getColorClass(month.intensity),
                  'flex flex-col items-center justify-center font-medium text-xs'
                )}
                onClick={() => onSelectMonth(month.month)}
              >
                <span className="text-[10px] opacity-60">
                  {month.month.format('MMM')}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>
              <div className="text-center">
                <div className="font-medium">
                  {month.month.format('MMMM YYYY')}
                </div>
                <div className="text-gray-500 text-sm dark:text-gray-400">
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
    const dayActivity = dailyActivity.find((activity) => {
      const activityDate = dayjs.utc(activity.date).tz(userTimezone);
      return activityDate.isSame(currentDay, 'day');
    });

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
          <h4 className="font-semibold text-base text-gray-900 dark:text-gray-100">
            {currentMonth.format('MMMM YYYY')}
          </h4>
          <div className="flex items-center gap-3 text-gray-600 text-xs dark:text-gray-400">
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
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            type="button"
            onClick={onNextMonth}
            className="h-7 w-7"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-7 gap-1.5 text-center font-medium text-gray-500 text-xs dark:text-gray-400">
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
                      'relative h-8 w-full rounded-md font-medium text-xs transition-all focus:outline-none',
                      'hover:z-10 hover:scale-105 focus:z-10 focus:scale-105',
                      day.isCurrentMonth
                        ? 'text-gray-900 dark:text-gray-100'
                        : 'text-gray-400 dark:text-gray-600',
                      day.activity
                        ? getColorClass(intensity)
                        : 'bg-gray-100/50 hover:bg-gray-100 dark:bg-gray-800/50 dark:hover:bg-gray-800',
                      day.isToday && 'ring-2 ring-blue-500 ring-offset-1',
                      'flex items-center justify-center'
                    )}
                  >
                    {day.date.format('D')}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={4}>
                  <div className="space-y-1">
                    <div className="font-medium">
                      {day.date.format('dddd, DD/MM/YYYY')}
                      {timeReference === 'smart' && (
                        <div className="text-gray-500 text-xs dark:text-gray-400">
                          {day.date.fromNow()}
                        </div>
                      )}
                    </div>
                    {day.activity ? (
                      <div className="text-emerald-600 text-sm dark:text-emerald-400">
                        {formatDuration(day.activity.duration)} •{' '}
                        {t('sessions', { count: day.activity.sessions })}
                      </div>
                    ) : (
                      <div className="text-gray-500 text-sm dark:text-gray-400">
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
