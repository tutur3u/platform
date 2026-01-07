'use client';

import { ChevronLeft, ChevronRight } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useState } from 'react';
import { Calendar } from './core';
import type { WorkspaceUserAttendance } from './utils';

interface YearCalendarProps {
  locale: string;
  initialDate?: Date;
  attendanceData?: WorkspaceUserAttendance[];

  onDateClick?: (date: Date) => void;

  onDayHeaderClick?: (dayIndex: number, monthDate: Date) => void;
  /** When true, hides days from previous and next months to reduce visual clutter */
  hideOutsideMonthDays?: boolean;
  /** Maximum date - prevents navigating to years beyond this date */
  maxDate?: Date;
  /** Minimum date - prevents navigating to years before this date */
  minDate?: Date;
}

export const YearCalendar: React.FC<YearCalendarProps> = ({
  locale,
  initialDate,
  attendanceData,
  onDateClick,
  onDayHeaderClick,
  hideOutsideMonthDays = false,
  maxDate,
  minDate,
}) => {
  const [currentYear, setCurrentYear] = useState(() => {
    const year = initialDate?.getFullYear() || new Date().getFullYear();
    if (minDate && year < minDate.getFullYear()) {
      return minDate.getFullYear();
    }
    if (maxDate && year > maxDate.getFullYear()) {
      return maxDate.getFullYear();
    }
    return year;
  });

  const handlePrevYear = () => setCurrentYear(currentYear - 1);
  const handleNextYear = () => setCurrentYear(currentYear + 1);

  // Determine if next year button should be disabled based on maxDate
  const isNextYearDisabled = maxDate
    ? currentYear >= maxDate.getFullYear()
    : false;

  // Determine if previous year button should be disabled based on minDate
  const isPrevYearDisabled = minDate
    ? currentYear <= minDate.getFullYear()
    : false;

  const months = Array.from(
    { length: 12 },
    (_, i) => new Date(currentYear, i, 1)
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border bg-foreground/5 p-4 font-bold text-xl md:text-2xl">
        <div className="flex items-center gap-1">{currentYear}</div>
        <div className="flex items-center gap-1">
          <Button
            size="xs"
            variant="secondary"
            onClick={handlePrevYear}
            disabled={isPrevYearDisabled}
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <Button
            size="xs"
            variant="secondary"
            onClick={handleNextYear}
            disabled={isNextYearDisabled}
          >
            <ChevronRight className="h-6 w-6" />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {months.map((month, idx) => (
          <div key={idx} className="rounded-lg border p-2">
            <Calendar
              locale={locale}
              initialDate={month}
              attendanceData={attendanceData}
              onDateClick={onDateClick}
              onDayHeaderClick={onDayHeaderClick}
              hideControls
              hideOutsideMonthDays={hideOutsideMonthDays}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
