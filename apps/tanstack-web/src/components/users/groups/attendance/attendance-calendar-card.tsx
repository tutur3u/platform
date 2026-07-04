'use client';

import { CalendarIcon, ChevronLeft, ChevronRight } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { formatSessionTimeRange } from './attendance-utils';
import type { AttendanceSession } from './types';

type AttendanceCalendarCardProps = {
  calendarMonth: Date;
  currentDate: Date;
  endingDate?: string | null;
  onCalendarMonthChange: (value: Date) => void;
  onDateChange: (value: string) => void;
  onSessionChange: (value: string) => void;
  sessionsByDate: Map<string, AttendanceSession[]>;
  startingDate?: string | null;
};

export function AttendanceCalendarCard({
  calendarMonth,
  currentDate,
  endingDate,
  onCalendarMonthChange,
  onDateChange,
  onSessionChange,
  sessionsByDate,
  startingDate,
}: AttendanceCalendarCardProps) {
  const locale = useLocale();
  const tAtt = useTranslations('ws-user-group-attendance');

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const newDay = new Date(calendarMonth);
        newDay.setDate(
          calendarMonth.getDate() -
            (calendarMonth.getDay() === 0 ? 6 : calendarMonth.getDay() - 1) +
            index
        );
        return newDay.toLocaleString(locale, { weekday: 'narrow' });
      }),
    [calendarMonth, locale]
  );

  const daysInMonth = useMemo(
    () =>
      Array.from({ length: 42 }, (_, index) => {
        const first = new Date(
          calendarMonth.getFullYear(),
          calendarMonth.getMonth(),
          1
        );
        const dayOfWeek = first.getDay();
        const adjustment = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        first.setDate(first.getDate() - adjustment + index);
        return first;
      }),
    [calendarMonth]
  );

  const isPrevDisabled = useMemo(() => {
    if (!startingDate) {
      return false;
    }

    const start = new Date(startingDate);
    const prevMonth = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth() - 1,
      1
    );

    return (
      prevMonth.getFullYear() < start.getFullYear() ||
      (prevMonth.getFullYear() === start.getFullYear() &&
        prevMonth.getMonth() < start.getMonth())
    );
  }, [calendarMonth, startingDate]);

  const isNextDisabled = useMemo(() => {
    if (!endingDate) {
      return false;
    }

    const end = new Date(endingDate);
    const nextMonth = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth() + 1,
      1
    );

    return (
      nextMonth.getFullYear() > end.getFullYear() ||
      (nextMonth.getFullYear() === end.getFullYear() &&
        nextMonth.getMonth() > end.getMonth())
    );
  }, [calendarMonth, endingDate]);

  const isCurrentMonth = (date: Date) =>
    date.getMonth() === calendarMonth.getMonth() &&
    date.getFullYear() === calendarMonth.getFullYear();

  return (
    <Card className="h-fit">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-3 font-bold">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-dynamic-purple/10 text-dynamic-purple">
            <CalendarIcon className="h-5 w-5" />
          </span>
          {format(currentDate, 'dd/MM/yyyy')}
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button
            disabled={isPrevDisabled}
            onClick={() =>
              onCalendarMonthChange(
                new Date(
                  calendarMonth.getFullYear(),
                  calendarMonth.getMonth() - 1,
                  1
                )
              )
            }
            size="xs"
            variant="secondary"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Button
            disabled={isNextDisabled}
            onClick={() =>
              onCalendarMonthChange(
                new Date(
                  calendarMonth.getFullYear(),
                  calendarMonth.getMonth() + 1,
                  1
                )
              )
            }
            size="xs"
            variant="secondary"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pb-0">
        <div className="mb-2 font-semibold text-foreground/60">
          {calendarMonth.getFullYear()} /{' '}
          {calendarMonth.toLocaleString(locale, { month: '2-digit' })}
        </div>
        <div className="relative grid gap-1 text-xs md:gap-2 md:text-base">
          <div className="grid grid-cols-7 gap-1 md:gap-2">
            {days.map((day, index) => (
              <div
                className="flex justify-center rounded bg-foreground/5 p-2 font-semibold md:rounded-lg"
                key={`weekday-${day}-${index}`}
              >
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 md:gap-2">
            {daysInMonth.map((day) => {
              const dayKey = format(day, 'yyyy-MM-dd');
              const inMonth = isCurrentMonth(day);
              const daySessions = sessionsByDate.get(dayKey) ?? [];
              const isSelected = dayKey === format(currentDate, 'yyyy-MM-dd');
              const base =
                'flex justify-center rounded p-2 font-semibold md:rounded-lg';

              if (!inMonth) {
                return (
                  <div
                    aria-hidden="true"
                    className={cn(
                      base,
                      'cursor-default border border-transparent'
                    )}
                    key={dayKey}
                  />
                );
              }

              return (
                <button
                  className={cn(
                    base,
                    'relative min-h-14 flex-col items-center border transition-all duration-300',
                    isSelected
                      ? 'scale-105 border-dynamic-purple/40 bg-dynamic-purple/15 font-bold text-foreground shadow-md'
                      : daySessions.length
                        ? 'border-foreground/10 bg-foreground/10 text-foreground hover:scale-105 hover:border-dynamic-purple/20 hover:bg-foreground/20 hover:shadow-sm'
                        : 'border-transparent text-foreground/30 hover:bg-foreground/5 hover:text-foreground/60'
                  )}
                  key={dayKey}
                  onClick={() => {
                    onDateChange(dayKey);
                    onSessionChange(
                      daySessions.length === 1 ? daySessions[0]!.id : ''
                    );
                  }}
                  type="button"
                >
                  <span>{day.getDate()}</span>
                  {daySessions.length > 0 && (
                    <span className="mt-1 max-w-full truncate rounded bg-dynamic-blue/10 px-1.5 py-0.5 text-[10px] text-dynamic-blue">
                      {daySessions.length === 1
                        ? formatSessionTimeRange(daySessions[0]!, locale)
                        : tAtt('session_count_short', {
                            count: daySessions.length,
                          })}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
