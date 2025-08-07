'use client';

import { Button } from '../button';
import { Popover, PopoverContent, PopoverTrigger } from '../popover';
import {
  add,
  eachMonthOfInterval,
  endOfYear,
  format,
  isFuture,
  parse,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface MonthPickerProps {
  lang: string;
  resetPage?: boolean;
  className?: string;
  defaultMonth?: string;
  onUpdate?: (
    // eslint-disable-next-line no-unused-vars
    args: {
      month: string;
      page?: string;
    },
    // eslint-disable-next-line no-unused-vars
    refresh: boolean
  ) => void;
}

export default function MonthPicker({
  lang,
  defaultMonth,
  resetPage = true,
  className,
  onUpdate,
}: MonthPickerProps) {
  const queryMonth = defaultMonth;

  const currentYYYYMM = Array.isArray(queryMonth)
    ? queryMonth?.[0] || format(new Date(), 'yyyy-MM')
    : queryMonth || format(new Date(), 'yyyy-MM');

  const currentMonth =
    typeof currentYYYYMM === 'string'
      ? parse(currentYYYYMM, 'yyyy-MM', new Date())
      : new Date();

  const [open, setOpen] = useState(false);
  const [previewDate, setPreviewDate] = useState(currentMonth);

  const updateQuery = (month: string) => {
    if (onUpdate) onUpdate({ month, page: resetPage ? '1' : undefined }, false);
    setOpen(false);
  };

  const firstDayCurrentYear = new Date(previewDate.getFullYear(), 0, 1);

  const months = eachMonthOfInterval({
    start: firstDayCurrentYear,
    end: endOfYear(firstDayCurrentYear),
  });

  function previousYear() {
    const firstDayLastYear = add(firstDayCurrentYear, { years: -1 });
    setPreviewDate(firstDayLastYear);
  }

  function nextYear() {
    const firstDayNextYear = add(firstDayCurrentYear, { years: 1 });
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

        <table
          className="w-full"
          aria-labelledby="month-picker"
        >
          <tbody>
            {(() => {
              const rows = [];
              for (let i = 0; i < months.length; i += 3) {
                const rowMonths = months.slice(i, i + 3);
                if (rowMonths.length === 0) continue; // Skip empty rows
                const firstMonth = rowMonths[0];
                if (!firstMonth) continue; // Skip if first month is undefined
                rows.push(
                  <tr key={`month-row-${format(firstMonth, 'yyyy-MM')}`}>
                    {rowMonths.map((month) => (
                      <td key={month.toString()} className="p-1">
                        <div className="relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-slate-100 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md dark:[&:has([aria-selected])]:bg-slate-800">
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
                      </td>
                    ))}
                    {/* Fill empty cells if needed */}
                    {Array.from({ length: 3 - rowMonths.length }, (_, j) => (
                      <td key={`empty-${format(firstMonth, 'yyyy-MM')}-${j}`} className="p-1" />
                    ))}
                  </tr>
                );
              }
              return rows;
            })()}
          </tbody>
        </table>
      </PopoverContent>
    </Popover>
  );
}
