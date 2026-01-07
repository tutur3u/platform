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
}

export const YearCalendar: React.FC<YearCalendarProps> = ({
  locale,
  initialDate,
  attendanceData,
  onDateClick,
  onDayHeaderClick,
  hideOutsideMonthDays = false,
  maxDate,
}) => {
  const [currentYear, setCurrentYear] = useState(
    initialDate?.getFullYear() || new Date().getFullYear()
  );

  const handlePrevYear = () => setCurrentYear(currentYear - 1);
  const handleNextYear = () => setCurrentYear(currentYear + 1);

  // Determine if next year button should be disabled based on maxDate
  const isNextYearDisabled = maxDate
    ? currentYear >= maxDate.getFullYear()
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
          <Button size="xs" variant="secondary" onClick={handlePrevYear}>
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
