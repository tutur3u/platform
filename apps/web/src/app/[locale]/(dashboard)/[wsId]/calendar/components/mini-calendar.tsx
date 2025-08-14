'use client';

import { Button } from '@tuturuuu/ui/button';
import { ChevronLeft, ChevronRight } from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import { useLocale } from 'next-intl';
import { useState } from 'react';

interface MiniCalendarProps {
  className?: string;
}

export function MiniCalendar({ className }: MiniCalendarProps) {
  const locale = useLocale();
  const [currentDate, setCurrentDate] = useState(new Date());

  const monthNames = Array.from({ length: 12 }, (_, i) =>
    new Date(0, i).toLocaleString(locale, { month: 'long' })
  );

  const dayAbbrevs = Array.from({ length: 7 }, (_, i) => {
    // Assumes week starts on Sunday. Adjust if necessary for your locales.
    const day = new Date(2000, 0, 2 + i);
    return {
      key: day.toLocaleString(locale, { weekday: 'short' }),
      label: day.toLocaleString(locale, { weekday: 'narrow' }),
    };
  });

  const goToPreviousMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() - 1)
    );
  };

  const goToNextMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() + 1)
    );
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();
    const startingDayOfWeek = firstDayOfMonth.getDay();

    const days = [];

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      const prevMonth = new Date(year, month - 1, 0);
      const prevMonthDay = prevMonth.getDate() - startingDayOfWeek + i + 1;
      days.push({
        day: prevMonthDay,
        isCurrentMonth: false,
        date: new Date(year, month - 1, prevMonthDay),
      });
    }

    // Add days of the current month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push({
        day,
        isCurrentMonth: true,
        date: new Date(year, month, day),
      });
    }

    // Always ensure we have exactly 6 rows (42 cells) for consistent height
    const totalCells = 42; // 6 rows × 7 columns
    let nextMonthDay = 1;
    for (let i = days.length; i < totalCells; i++) {
      days.push({
        day: nextMonthDay,
        isCurrentMonth: false,
        date: new Date(year, month + 1, nextMonthDay),
      });
      nextMonthDay++;
    }

    return days;
  };

  const today = new Date();
  const isToday = (date: Date) => {
    return date.toDateString() === today.toDateString();
  };

  const days = getDaysInMonth(currentDate);

  return (
    <div className={cn('rounded-lg border bg-background p-4', className)}>
      {/* Month Header */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
        </h3>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={goToPreviousMonth}
            className="h-6 w-6 p-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={goToNextMonth}
            className="h-6 w-6 p-0"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="grid min-h-[140px] grid-cols-7 gap-1">
        {/* Day headers */}
        {dayAbbrevs.map((day) => (
          <div
            key={day.key}
            className="flex h-6 w-6 items-center justify-center text-xs font-medium text-muted-foreground"
          >
            {day.label}
          </div>
        ))}

        {/* Calendar days */}
        {days.map((dayInfo, index) => (
          <button
            key={`${dayInfo.date.getTime()}-${index}`}
            type="button"
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-sm text-xs transition-colors hover:bg-accent hover:text-accent-foreground',
              !dayInfo.isCurrentMonth && 'text-muted-foreground opacity-50',
              isToday(dayInfo.date) &&
                'bg-primary font-semibold text-primary-foreground',
              dayInfo.isCurrentMonth &&
                !isToday(dayInfo.date) &&
                'text-foreground'
            )}
          >
            {dayInfo.day}
          </button>
        ))}
      </div>
    </div>
  );
}
