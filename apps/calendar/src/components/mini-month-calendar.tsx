'use client';

import { ChevronLeft, ChevronRight } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
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

export function MiniMonthCalendar() {
  const locale = useLocale();
  const t = useTranslations('calendar-sidebar');
  const { date, setDate } = useCalendarNavigation();
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(date));
  const calendarLocale = locale.startsWith('vi') ? vi : enUS;
  const days = useMemo(() => getMiniMonthDays(visibleMonth), [visibleMonth]);
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
    <section aria-label={t('month_calendar')} className="space-y-2 px-3 pt-3">
      <div className="flex items-center justify-between gap-2">
        <Button
          className="h-7 rounded-full px-2.5 font-medium text-xs"
          onClick={() => setDate(new Date())}
          size="sm"
          variant="ghost"
        >
          {t('today')}
        </Button>
        <div className="flex items-center gap-0.5">
          <Button
            aria-label={t('previous_month')}
            className="h-7 w-7 rounded-full"
            onClick={() => setVisibleMonth((month) => addMonths(month, -1))}
            size="icon"
            variant="ghost"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            aria-label={t('next_month')}
            className="h-7 w-7 rounded-full"
            onClick={() => setVisibleMonth((month) => addMonths(month, 1))}
            size="icon"
            variant="ghost"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <p className="px-1 font-semibold text-sm">
        {format(visibleMonth, 'MMMM yyyy', { locale: calendarLocale })}
      </p>

      <div className="grid grid-cols-7 text-center text-[10px] text-muted-foreground">
        {weekdays.map((weekday, index) => (
          <span key={`${weekday}-${index}`} className="py-1">
            {weekday}
          </span>
        ))}
        {days.map((day) => {
          const selected = isSameDay(day, date);
          const today = isSameDay(day, new Date());

          return (
            <button
              aria-current={today ? 'date' : undefined}
              aria-label={format(day, 'PPPP', { locale: calendarLocale })}
              className={cn(
                'mx-auto flex h-7 w-7 items-center justify-center rounded-full text-[11px] transition-colors hover:bg-foreground/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                !isSameMonth(day, visibleMonth) && 'text-muted-foreground/45',
                selected &&
                  'bg-primary text-primary-foreground hover:bg-primary',
                today &&
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
