'use client';

import { Calendar } from './core';
import { WorkspaceUserAttendance } from './utils';
import { Button } from '@ncthub/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface YearCalendarProps {
  locale: string;
  initialDate?: Date;
  attendanceData?: WorkspaceUserAttendance[];
  // eslint-disable-next-line no-unused-vars
  onDateClick?: (date: Date) => void;
}

export const YearCalendar: React.FC<YearCalendarProps> = ({
  locale,
  initialDate,
  attendanceData,
  onDateClick,
}) => {
  const [currentYear, setCurrentYear] = useState(
    initialDate?.getFullYear() || new Date().getFullYear()
  );

  const handlePrevYear = () => setCurrentYear(currentYear - 1);
  const handleNextYear = () => setCurrentYear(currentYear + 1);

  const months = Array.from(
    { length: 12 },
    (_, i) => new Date(currentYear, i, 1)
  );

  return (
    <div>
      <div className="bg-foreground/5 mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border p-4 text-xl font-bold md:text-2xl">
        <div className="flex items-center gap-1">{currentYear}</div>
        <div className="flex items-center gap-1">
          <Button size="xs" variant="secondary" onClick={handlePrevYear}>
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <Button size="xs" variant="secondary" onClick={handleNextYear}>
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
              hideControls
            />
          </div>
        ))}
      </div>
    </div>
  );
};
