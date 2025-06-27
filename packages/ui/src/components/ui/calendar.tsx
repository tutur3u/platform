'use client';

import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import { buttonVariants } from './button';
import { DateInput } from './custom/date-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select';

export type CalendarProps = React.ComponentProps<typeof DayPicker> & {
  // eslint-disable-next-line no-unused-vars
  onSubmit?: (date: Date) => void;
};

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  onSubmit,
  ...props
}: CalendarProps) {
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

  return (
    <div className="space-y-4">
      {props.mode === 'single' && (
        <div className="flex items-center justify-center border-b p-2">
          <DateInput
            value={props.selected as Date}
            onChange={props.onSelect}
            onSubmit={onSubmit}
          />
        </div>
      )}

      <div>
        <div className="flex items-center justify-between gap-2 border-b px-2 pb-4">
          <button
            onClick={() => {
              const prev = new Date(month);
              prev.setMonth(prev.getMonth() - 1);
              setMonth(prev);
            }}
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'icon' }),
              'h-7 w-7 transition-colors hover:bg-accent/50'
            )}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-2">
            <Select
              value={month.getFullYear().toString()}
              onValueChange={(year) => {
                const newDate = new Date(month);
                newDate.setFullYear(parseInt(year));
                setMonth(newDate);
              }}
            >
              <SelectTrigger
                className={cn(
                  'h-8 w-[90px] transition-colors',
                  isCurrentYear && 'font-medium text-primary'
                )}
              >
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent
                position="popper"
                className="h-[300px] overflow-y-auto"
              >
                <div className="sticky top-0 -mx-1 flex items-center justify-center border-b bg-background py-1">
                  <div className="px-2 text-sm font-medium text-muted-foreground">
                    {currentYear}
                  </div>
                </div>
                {years.map((year) => (
                  <SelectItem
                    key={year.value}
                    value={year.value}
                    className={cn(
                      'transition-colors',
                      parseInt(year.value) === currentYear &&
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
                const newDate = new Date(month);
                newDate.setMonth(parseInt(monthValue));
                setMonth(newDate);
              }}
            >
              <SelectTrigger
                className={cn(
                  'h-8 w-[130px] transition-colors',
                  isCurrentMonth && 'font-medium text-primary'
                )}
              >
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent position="popper">
                {months.map((month) => (
                  <SelectItem
                    key={month.value}
                    value={month.value}
                    className="capitalize"
                  >
                    {month.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <button
            onClick={() => {
              const next = new Date(month);
              next.setMonth(next.getMonth() + 1);
              setMonth(next);
            }}
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'icon' }),
              'h-7 w-7 transition-colors hover:bg-accent/50'
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
          className={cn('', className)}
          classNames={{
            root: 'bg-transparent',
            months: 'flex flex-col',
            month:
              'space-y-4 min-w-[276px] text-center p-2 font-semibold shrink-0',
            caption: 'hidden',
            nav: 'hidden',
            nav_button: 'hidden',
            table: 'w-full border-collapse',
            head_row: 'grid grid-cols-7 gap-1',
            weekday:
              'text-muted-foreground rounded-md font-normal text-[0.8rem] text-center',
            row: 'grid grid-cols-7 gap-1 mt-2',
            day: 'text-center text-sm p-0 relative w-9',
            day_button: cn(
              buttonVariants({ variant: 'ghost' }),
              'h-9 w-full rounded-md p-0 font-normal transition-colors duration-300',
              'aria-selected:bg-foreground aria-selected:text-background',
              'hover:bg-accent/50 hover:text-accent-foreground',
              'hover:aria-selected:bg-foreground hover:aria-selected:text-background'
            ),
            selected: 'bg-foreground! text-background! rounded-md',
            today: 'bg-accent text-accent-foreground rounded-md font-medium',
            outside: 'text-muted-foreground opacity-40 grayscale',
            disabled: 'text-muted-foreground opacity-50',
            range_start: 'bg-foreground! text-background! rounded-l-md',
            range_end: 'bg-foreground! text-background! rounded-r-md',
            range_middle: 'aria-selected:bg-foreground/20',
            hidden: 'invisible',
            month_grid: 'w-full',
            ...classNames,
          }}
        />
      </div>
    </div>
  );
}

export { Calendar };
