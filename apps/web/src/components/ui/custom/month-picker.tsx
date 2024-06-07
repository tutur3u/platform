'use client';

import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import useSearchParams from '@/hooks/useSearchParams';
import {
  add,
  eachMonthOfInterval,
  endOfYear,
  format,
  isFuture,
  parse,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import useTranslation from 'next-translate/useTranslation';
import { useState } from 'react';

interface MonthPickerProps {
  resetPage?: boolean;
  className?: string;
}

export default function MonthPicker({
  resetPage = true,
  className,
}: MonthPickerProps) {
  const { lang } = useTranslation('common');
  const searchParams = useSearchParams();

  const queryMonth = searchParams.get('month');

  const currentYYYYMM = Array.isArray(queryMonth)
    ? queryMonth[0]
    : queryMonth || format(new Date(), 'yyyy-MM');

  const currentMonth =
    typeof currentYYYYMM === 'string'
      ? parse(currentYYYYMM, 'yyyy-MM', new Date())
      : new Date();

  const [open, setOpen] = useState(false);
  const [previewDate, setPreviewDate] = useState(currentMonth);

  const updateQuery = (month: string) => {
    searchParams.set({ month, page: resetPage ? '1' : undefined }, false);
    setOpen(false);
  };

  const firstDayCurrentYear = new Date(previewDate.getFullYear(), 0, 1);

  const months = eachMonthOfInterval({
    start: firstDayCurrentYear,
    end: endOfYear(firstDayCurrentYear),
  });

  function previousYear() {
    let firstDayLastYear = add(firstDayCurrentYear, { years: -1 });
    setPreviewDate(firstDayLastYear);
  }

  function nextYear() {
    let firstDayNextYear = add(firstDayCurrentYear, { years: 1 });
    setPreviewDate(firstDayNextYear);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="xs"
          variant="outline"
          onClick={() => setOpen((prev) => !prev)}
          className={className}
        >
          {currentMonth.toLocaleString(lang, {
            month: '2-digit',
            year: 'numeric',
          })}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="flex items-center justify-between pb-2">
          <Button
            size="xs"
            variant="outline"
            name="previous-year"
            aria-label="Go to previous year"
            onClick={previousYear}
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
            size="xs"
            variant="outline"
            name="next-year"
            aria-label="Go to next year"
            onClick={nextYear}
            disabled={
              firstDayCurrentYear.getFullYear() >= new Date().getFullYear()
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
                  currentMonth.getMonth() === month.getMonth() &&
                  currentMonth.getFullYear() === month.getFullYear()
                    ? 'default'
                    : 'ghost'
                }
                className="w-full"
                disabled={isFuture(month)}
                onClick={() => updateQuery(format(month, 'yyyy-MM'))}
              >
                <time dateTime={format(month, 'yyyy-MM-dd')}>
                  {month.toLocaleString(lang, { month: 'short' })}
                </time>
              </Button>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
