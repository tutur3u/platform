'use client';

import { ChevronLeft, ChevronRight } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useCalendarClock } from '@tuturuuu/ui/hooks/use-calendar-clock';
import { calendarToday } from '@tuturuuu/ui/lib/calendar-day';
import { cn } from '@tuturuuu/utils/format';
import {
  addMonths,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
} from 'date-fns';
import { enUS, vi } from 'date-fns/locale';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { useCalendarNavigation } from './calendar-navigation-provider';
import { getMiniMonthDays } from './mini-month-utils';

/**
 * Date picking only: the toolbar owns Today and period navigation. The
 * chevrons page the visible month without changing the selected date.
 */
export function MiniMonthCalendar() {
  const locale = useLocale();
  const t = useTranslations('calendar-sidebar');
  const now = useCalendarClock();
  const { date, setDate, timezone } = useCalendarNavigation();
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(date));
  const calendarLocale = locale.startsWith('vi') ? vi : enUS;
  const days = useMemo(() => getMiniMonthDays(visibleMonth), [visibleMonth]);
  const today = calendarToday(timezone, now);
  const weekdays = days
    .slice(0, 7)
    .map((day) => format(day, 'EEEEE', { locale: calendarLocale }));

  useEffect(() => {
    setVisibleMonth(startOfMonth(date));
  }, [date]);

  const selectDate = (day: Date) => {
    setDate(day);
    if (!isSameMonth(day, visibleMonth)) setVisibleMonth(startOfMonth(day));
  };

  return (
    <section aria-label={t('month_calendar')} className="space-y-1 px-3 pt-3">
      <div className="flex h-8 items-center justify-between gap-2">
        <p className="truncate px-1 font-semibold text-sm">
          {format(visibleMonth, 'MMMM yyyy', { locale: calendarLocale })}
        </p>
        <div className="flex shrink-0 items-center">
          <Button
            aria-label={t('previous_month')}
            className="size-7"
            onClick={() => setVisibleMonth((month) => addMonths(month, -1))}
            size="icon"
            variant="ghost"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            aria-label={t('next_month')}
            className="size-7"
            onClick={() => setVisibleMonth((month) => addMonths(month, 1))}
            size="icon"
            variant="ghost"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 text-center text-muted-foreground text-xs">
        {weekdays.map((weekday, index) => (
          <span key={`${weekday}-${index}`} className="py-1">
            {weekday}
          </span>
        ))}
        {days.map((day) => {
          const selected = isSameDay(day, date);
          const isToday = isSameDay(day, today);

          return (
            <button
              aria-current={isToday ? 'date' : undefined}
              aria-label={format(day, 'PPPP', { locale: calendarLocale })}
              aria-pressed={selected}
              className={cn(
                'mx-auto flex size-7 items-center justify-center rounded-full text-xs transition-colors hover:bg-foreground/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                !isSameMonth(day, visibleMonth) && 'text-muted-foreground/45',
                selected &&
                  'bg-primary text-primary-foreground hover:bg-primary',
                isToday &&
                  !selected &&
                  'font-semibold text-primary ring-1 ring-primary/50'
              )}
              key={day.toISOString()}
              onClick={() => selectDate(day)}
              type="button"
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>
    </section>
  );
}
