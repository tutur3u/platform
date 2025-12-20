'use client';

import { ChevronLeft, ChevronRight } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';
import dayjs from 'dayjs';
import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import { useCalendarPreferences } from '../../hooks/use-calendar-preferences';
import { buttonVariants } from './button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select';

export type CalendarProps = React.ComponentProps<typeof DayPicker> & {
  onSubmit?: (date: Date) => void;
  minDate?: Date;
  preferences?: {
    weekStartsOn?: 0 | 1 | 6;
    timezone?: string;
  };
};

function Calendar({
  className,
  classNames,
  onSubmit,
  minDate,
  preferences: preferencesProp,
  ...props
}: CalendarProps) {
  const contextPreferences = useCalendarPreferences();
  const preferences = preferencesProp ?? contextPreferences;

  const defaultMonth = props.defaultMonth || new Date();
  const [month, setMonth] = React.useState<Date>(defaultMonth);

  const years = Array.from({ length: 200 }, (_, i) => {
    const year = new Date().getFullYear() - 100 + i;
    return { value: year.toString(), label: year.toString() };
  });

  const months = Array.from({ length: 12 }, (_, i) => {
    const month = new Date(2024, i, 1);
    return {
      value: i.toString(),
      label: format(month, 'MMMM'),
    };
  });

  const currentYear = new Date().getFullYear();
  const isCurrentYear = month.getFullYear() === currentYear;
  const isCurrentMonth =
    month.getMonth() === new Date().getMonth() && isCurrentYear;

  // Helper functions for minDate logic
  const isPreviousMonthDisabled = () => {
    if (!minDate) return false;
    // Use dayjs for safe date manipulation to avoid issues with month-end dates.
    const prevMonth = dayjs(month).subtract(1, 'month');
    return prevMonth.isBefore(dayjs(minDate).startOf('month'));
  };

  const isYearDisabled = (year: number) => {
    if (!minDate) return false;
    return year < minDate.getFullYear();
  };

  const isMonthDisabled = (monthIndex: number) => {
    if (!minDate) return false;
    const selectedYear = month.getFullYear();
    const minYear = minDate.getFullYear();
    const minMonth = minDate.getMonth();

    if (selectedYear < minYear) return true;
    if (selectedYear > minYear) return false;
    return monthIndex < minMonth;
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-4 flex items-center justify-between gap-2 border-b px-2 pb-4">
          <button
            type="button"
            onClick={() => {
              // Use dayjs for safe date manipulation to avoid issues with month-end dates.
              const prev = dayjs(month).subtract(1, 'month').toDate();
              setMonth(prev);
            }}
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'icon' }),
              'h-7 w-7 transition-colors hover:bg-accent/50',
              className?.includes('bg-background/50') &&
                'bg-background/50 hover:bg-background/80'
            )}
            disabled={isPreviousMonthDisabled()}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-2">
            <Select
              value={month.getFullYear().toString()}
              onValueChange={(year) => {
                // Use dayjs for safe date manipulation to avoid issues with month-end dates.
                const newDate = dayjs(month).year(parseInt(year, 10)).toDate();
                setMonth(newDate);
              }}
            >
              <SelectTrigger
                className={cn(
                  'h-8 w-[90px] transition-colors',
                  isCurrentYear && 'font-medium text-primary',
                  className?.includes('bg-background/50') &&
                    'bg-background/50 hover:bg-background/80'
                )}
              >
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent
                position="popper"
                className="h-[300px] overflow-y-auto"
              >
                <div className="sticky top-0 -mx-1 flex items-center justify-center border-b bg-background py-1">
                  <div className="px-2 font-medium text-muted-foreground text-sm">
                    {currentYear}
                  </div>
                </div>
                {years.map((year) => (
                  <SelectItem
                    key={year.value}
                    value={year.value}
                    disabled={isYearDisabled(parseInt(year.value, 10))}
                    className={cn(
                      'transition-colors',
                      parseInt(year.value, 10) === currentYear &&
                        'font-medium text-primary'
                    )}
                  >
                    {year.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={month.getMonth().toString()}
              onValueChange={(monthValue) => {
                // Use dayjs for safe date manipulation to avoid issues with month-end dates.
                const newDate = dayjs(month)
                  .month(parseInt(monthValue, 10))
                  .toDate();
                setMonth(newDate);
              }}
            >
              <SelectTrigger
                className={cn(
                  'h-8 w-[130px] transition-colors',
                  isCurrentMonth && 'font-medium text-primary',
                  className?.includes('bg-background/50') &&
                    'bg-background/50 hover:bg-background/80'
                )}
              >
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent position="popper">
                {months.map((month) => (
                  <SelectItem
                    key={month.value}
                    value={month.value}
                    disabled={isMonthDisabled(parseInt(month.value, 10))}
                    className="capitalize"
                  >
                    {month.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <button
            type="button"
            onClick={() => {
              // Use dayjs for safe date manipulation to avoid issues with month-end dates.
              const next = dayjs(month).add(1, 'month').toDate();
              setMonth(next);
            }}
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'icon' }),
              'h-7 w-7 transition-colors hover:bg-accent/50',
              className?.includes('bg-background/50') &&
                'bg-background/50 hover:bg-background/80'
            )}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <DayPicker
          {...props}
          month={month}
          onMonthChange={setMonth}
          defaultMonth={defaultMonth}
          showOutsideDays={true}
          weekStartsOn={props.weekStartsOn ?? preferences.weekStartsOn}
          className={cn('', className)}
          classNames={{
            root: 'bg-transparent',
            months: 'flex flex-col',
            month:
              'space-y-4 max-w-[calc(100vw-4rem)] text-center p-2 font-semibold shrink-0',
            caption: 'hidden',
            nav: 'hidden',
            nav_button: 'hidden',
            table: 'w-full border-collapse',
            head_row: 'grid grid-cols-7 gap-1',
            weeks: 'flex flex-col gap-1',
            week: 'flex justify-center gap-1',
            weekdays: 'flex justify-evenly justify-center w-full mb-2',
            weekday:
              'text-muted-foreground rounded-md font-normal text-[0.8rem] text-center',
            row: 'grid grid-cols-7 gap-1 mt-2',
            day: 'text-center text-sm p-0 relative w-9',
            day_button: cn(
              buttonVariants({ variant: 'ghost' }),
              'h-9 w-full rounded-md p-0 font-normal transition-colors duration-300',
              'aria-selected:bg-primary aria-selected:text-primary-foreground',
              'hover:bg-accent/50 hover:text-accent-foreground',
              'hover:aria-selected:bg-primary hover:aria-selected:text-primary-foreground'
            ),
            selected: 'bg-primary! text-primary-foreground! rounded-md',
            today:
              'bg-accent text-accent-foreground rounded-md font-medium ring-2 ring-primary/50',
            outside: 'text-muted-foreground opacity-40 grayscale',
            disabled: 'text-muted-foreground opacity-50',
            range_start: 'bg-primary! text-primary-foreground! rounded-l-md',
            range_end: 'bg-primary! text-primary-foreground! rounded-r-md',
            range_middle: 'aria-selected:bg-primary/20',
            hidden: 'invisible',
            month_grid: 'w-full',
            month_caption: 'hidden',
            ...classNames,
          }}
          disabled={minDate ? { before: minDate } : undefined}
        />
      </div>
    </div>
  );
}

export { Calendar };
