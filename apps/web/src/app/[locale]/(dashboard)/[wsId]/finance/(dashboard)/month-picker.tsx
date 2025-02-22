import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils';
import {
  add,
  eachMonthOfInterval,
  format,
  isAfter,
  isBefore,
  startOfMonth,
} from 'date-fns';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useEffect, useState } from 'react';

interface Props {
  defaultValue?: Date;
  fromDate?: Date;
  toDate?: Date;
  // eslint-disable-next-line no-unused-vars
  onValueChange: (date?: Date) => void;
  className?: string;
}

export function MonthPicker({
  defaultValue,
  fromDate,
  toDate,
  onValueChange,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const today = new Date();
  const [previewDate, setPreviewDate] = useState(
    defaultValue || new Date(today.getFullYear(), today.getMonth(), 1)
  );

  useEffect(() => {
    if (defaultValue) {
      setPreviewDate(defaultValue);
    }
  }, [defaultValue]);

  const firstDayCurrentYear = new Date(previewDate.getFullYear(), 0, 1);
  const months = eachMonthOfInterval({
    start: firstDayCurrentYear,
    end: add(firstDayCurrentYear, { months: 11 }),
  });

  const changeYear = (years: number) => {
    const newDate = add(firstDayCurrentYear, { years });
    if (
      (!fromDate || !isBefore(newDate, startOfMonth(fromDate))) &&
      (!toDate || !isAfter(newDate, startOfMonth(toDate)))
    ) {
      setPreviewDate(newDate);
    }
  };

  const isMonthDisabled = (month: Date) => {
    return (
      (fromDate && isBefore(month, startOfMonth(fromDate))) ||
      (toDate && isAfter(month, startOfMonth(toDate)))
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={'outline'}
          className={cn(
            'w-[280px] justify-start text-left font-normal',
            !defaultValue && 'text-muted-foreground',
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {defaultValue ? (
            format(defaultValue, 'MMMM yyyy')
          ) : (
            <span>Pick a month</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="flex items-center justify-between pb-2">
          <Button
            variant="outline"
            name="previous-year"
            aria-label="Go to previous year"
            onClick={() => changeYear(-1)}
            disabled={
              fromDate &&
              isBefore(
                add(firstDayCurrentYear, { years: -1 }),
                startOfMonth(fromDate)
              )
            }
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div
            className="text-sm font-medium"
            aria-live="polite"
            role="presentation"
            id="month-picker"
          >
            {format(firstDayCurrentYear, 'yyyy')}
          </div>

          <Button
            variant="outline"
            name="next-year"
            aria-label="Go to next year"
            onClick={() => changeYear(1)}
            disabled={
              toDate &&
              isAfter(
                add(firstDayCurrentYear, { years: 1 }),
                startOfMonth(toDate)
              )
            }
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div
          className="grid w-full grid-cols-3 gap-2"
          role="grid"
          aria-labelledby="month-picker"
        >
          {months.map((month) => (
            <div
              key={month.toString()}
              className="relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-slate-100 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md dark:[&:has([aria-selected])]:bg-slate-800"
              role="presentation"
            >
              <Button
                variant={
                  defaultValue?.getMonth() === month.getMonth() &&
                  defaultValue?.getFullYear() === month.getFullYear()
                    ? 'default'
                    : 'ghost'
                }
                className="w-full"
                onClick={() => onValueChange(month)}
                disabled={isMonthDisabled(month)}
              >
                <time dateTime={format(month, 'yyyy-MM-dd')}>
                  {format(month, 'MMMM')}
                </time>
              </Button>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
