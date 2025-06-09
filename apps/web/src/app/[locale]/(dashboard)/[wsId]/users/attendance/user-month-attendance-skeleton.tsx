'use client';

import useSearchParams from '@/hooks/useSearchParams';
import { Button } from '@tuturuuu/ui/button';
import { ChevronLeft, ChevronRight } from '@tuturuuu/ui/icons';
import { format, parse } from 'date-fns';
import { useLocale } from 'next-intl';
import { Fragment, useMemo } from 'react';

export default function UserMonthAttendanceSkeleton() {
  const locale = useLocale();
  const searchParams = useSearchParams();

  const currentYYYYMM = useMemo(
    () => searchParams.get('month') || format(new Date(), 'yyyy-MM'),
    [searchParams]
  );

  const currentMonth = useMemo(
    () =>
      typeof currentYYYYMM === 'string'
        ? parse(currentYYYYMM, 'yyyy-MM', new Date())
        : new Date(),
    [currentYYYYMM]
  );

  const thisYear = currentMonth.getFullYear();
  const thisMonth = currentMonth.toLocaleString(locale, { month: '2-digit' });

  // includes all days of the week, starting from monday to sunday
  const days = Array.from({ length: 7 }, (_, i) => {
    let newDay = new Date(currentMonth);
    newDay.setDate(currentMonth.getDate() - currentMonth.getDay() + i + 1);
    return newDay.toLocaleString(locale, { weekday: 'narrow' });
  });

  // includes all days of the month, starting from monday (which could be from the previous month) to sunday (which could be from the next month)
  const daysInMonth = Array.from({ length: 42 }, (_, i) => {
    let newDay = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth(),
      1
    );
    let dayOfWeek = newDay.getDay();
    let adjustment = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // adjust for Monday start
    newDay.setDate(newDay.getDate() - adjustment + i);
    return newDay;
  });

  const isCurrentMonth = (date: Date) =>
    date.getMonth() === currentMonth.getMonth() &&
    date.getFullYear() === currentMonth.getFullYear();

  return (
    <div className="animate-pulse rounded-lg border p-4 opacity-50">
      <div className="mb-2 flex w-full items-center border-b pb-2">
        <div className="aspect-square h-10 w-10 rounded-lg bg-linear-to-br from-green-300 via-blue-500 to-purple-600 dark:from-green-300/70 dark:via-blue-500/70 dark:to-purple-600/70" />
        <div className="ml-2 w-full">
          <div className="flex items-center justify-between gap-1">
            <div className="line-clamp-1 h-6 w-32 rounded bg-foreground/5 font-semibold text-zinc-900 hover:underline dark:text-zinc-200" />
          </div>
        </div>
      </div>

      <div>
        <div className="grid h-full gap-8">
          <div key={2024} className="flex h-full flex-col">
            <div className="mb-4 flex items-center justify-between gap-4 text-xl font-bold md:text-2xl">
              <div className="flex items-center gap-1">
                {thisYear}
                <div className="mx-2 h-4 w-px rotate-30 bg-foreground/20" />
                <span className="text-lg font-semibold md:text-xl">
                  {thisMonth}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <div className="rounded border bg-foreground/5 px-2 py-0.5 text-xs opacity-50">
                  <span className="text-green-500 dark:text-green-300">?</span>{' '}
                  + <span className="text-red-500 dark:text-red-300">?</span> ={' '}
                  <span className="text-blue-500 dark:text-blue-300">?</span>
                </div>

                <Button size="xs" variant="secondary" disabled>
                  <ChevronLeft className="h-6 w-6" />
                </Button>

                <Button size="xs" variant="secondary" disabled>
                  <ChevronRight className="h-6 w-6" />
                </Button>
              </div>
            </div>

            <div className="relative grid gap-1 text-xs md:gap-2 md:text-base">
              <div className="grid grid-cols-7 gap-1 md:gap-2">
                {days.map((day, idx) => (
                  <div
                    key={`day-${idx}`}
                    className="flex flex-none cursor-default justify-center rounded bg-foreground/5 p-2 font-semibold transition duration-300 md:rounded-lg"
                  >
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1 md:gap-2">
                {daysInMonth.map((day, idx) => (
                  <Fragment key={`day-${idx}`}>
                    <div
                      className={`flex flex-none cursor-default justify-center rounded border p-2 font-semibold transition duration-300 md:rounded-lg ${
                        !isCurrentMonth(day)
                          ? 'border-transparent text-foreground/20'
                          : 'bg-foreground/5 text-foreground/40 dark:bg-foreground/10'
                      }`}
                    >
                      {day.getDate()}
                    </div>
                  </Fragment>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
