import { Button } from '@tutur3u/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tutur3u/ui/popover';
import { cn } from '@tutur3u/utils/format';
import {
  add,
  eachYearOfInterval,
  format,
  isAfter,
  isBefore,
  startOfYear,
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
  onValueChange: (date?: Date) => void;
  className?: string;
}

export function YearPicker({
  defaultValue,
  fromDate,
  toDate,
  onValueChange,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const today = new Date();
  const [previewDate, setPreviewDate] = useState(
    defaultValue || new Date(today.getFullYear(), 0, 1)
  );

  useEffect(() => {
    if (defaultValue) {
      setPreviewDate(defaultValue);
    }
  }, [defaultValue]);

  const firstYearOfDecade =
    previewDate.getFullYear() - (previewDate.getFullYear() % 10);
  const firstYearOfDecadeDate = new Date(firstYearOfDecade, 0, 1);
  const lastYearOfDecade = firstYearOfDecade + 9;
  const lastYearOfDecadeDate = new Date(lastYearOfDecade, 11, 31);
  const years = eachYearOfInterval({
    start: firstYearOfDecadeDate,
    end: lastYearOfDecadeDate,
  });

  const changeDecade = (decades: number) => {
    const newDate = add(firstYearOfDecadeDate, { years: decades * 10 });
    if (
      (!fromDate || !isBefore(newDate, startOfYear(fromDate))) &&
      (!toDate || !isAfter(newDate, startOfYear(toDate)))
    ) {
      setPreviewDate(newDate);
    }
  };

  const isYearDisabled = (year: Date) => {
    return (
      (fromDate && isBefore(year, startOfYear(fromDate))) ||
      (toDate && isAfter(year, startOfYear(toDate)))
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          onClick={() => setOpen((prev) => !prev)}
          className={cn(
            'w-[280px] justify-start text-left font-normal',
            !defaultValue && 'text-muted-foreground',
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {defaultValue ? (
            format(defaultValue, 'yyyy')
          ) : (
            <span>Pick a year</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="flex items-center justify-between pb-2">
          <Button
            variant="outline"
            name="previous-decade"
            aria-label="Go to previous decade"
            onClick={() => changeDecade(-1)}
            disabled={
              fromDate &&
              isBefore(
                add(firstYearOfDecadeDate, { years: -10 }),
                startOfYear(fromDate)
              )
            }
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div
            className="text-sm font-medium"
            aria-live="polite"
            role="presentation"
            id="year-picker"
          >
            {format(firstYearOfDecadeDate, 'yyyy')} -{' '}
            {format(lastYearOfDecadeDate, 'yyyy')}
          </div>

          <Button
            variant="outline"
            name="next-decade"
            aria-label="Go to next decade"
            onClick={() => changeDecade(1)}
            disabled={
              toDate &&
              isAfter(
                add(lastYearOfDecadeDate, { years: 1 }),
                startOfYear(toDate)
              )
            }
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div
          className="grid w-full grid-cols-3 gap-2"
          role="grid"
          aria-labelledby="year-picker"
        >
          {years.map((year) => (
            <div
              key={year.toString()}
              className="relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-slate-100 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md dark:[&:has([aria-selected])]:bg-slate-800"
              role="presentation"
            >
              <Button
                variant={
                  defaultValue?.getFullYear() === year.getFullYear()
                    ? 'default'
                    : 'ghost'
                }
                className="w-full"
                onClick={() => onValueChange(year)}
                disabled={isYearDisabled(year)}
              >
                <time dateTime={format(year, 'yyyy-MM-dd')}>
                  {format(year, 'yyyy')}
                </time>
              </Button>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
