'use client';

import { useEffect, useState } from 'react';
import { MonthView } from './month-view';
import type { WorkspaceUserAttendance } from './utils';
import { YearView } from './year-view';

interface CalendarProps {
  locale: string;
  initialDate?: Date;
  attendanceData?: WorkspaceUserAttendance[];
  // eslint-disable-next-line no-unused-vars
  onDateClick?: (date: Date) => void;
  // eslint-disable-next-line no-unused-vars
  onDayHeaderClick?: (dayIndex: number, monthDate: Date) => void;
  hideControls?: boolean;
  hideYear?: boolean;
  /** When true, hides days from previous and next months to reduce visual clutter */
  hideOutsideMonthDays?: boolean;
  canUpdateSchedule?: boolean;
}

export const Calendar: React.FC<CalendarProps> = ({
  locale,
  initialDate,
  attendanceData,
  onDateClick,
  onDayHeaderClick,
  hideControls = false,
  hideYear = false,
  hideOutsideMonthDays = false,
}) => {
  const [currentDate, setCurrentDate] = useState(initialDate || new Date());
  const [viewMode, setViewMode] = useState<'month' | 'year'>('month');

  useEffect(() => {
    setCurrentDate(initialDate || new Date());
  }, [initialDate]);

  const handleMonthClick = (month: number) => {
    setCurrentDate(new Date(currentDate.setMonth(month)));
    setViewMode('month');
  };

  const handleYearViewClick = () => {
    setViewMode('year');
  };

  return viewMode === 'month' ? (
    <MonthView
      locale={locale}
      currentDate={currentDate}
      setCurrentDate={setCurrentDate}
      attendanceData={attendanceData}
      onDateClick={onDateClick}
      onDayHeaderClick={onDayHeaderClick}
      onYearViewClick={handleYearViewClick}
      hideControls={hideControls}
      hideYear={hideYear}
      hideOutsideMonthDays={hideOutsideMonthDays}
    />
  ) : (
    <YearView
      locale={locale}
      currentDate={currentDate}
      setCurrentDate={setCurrentDate}
      handleMonthClick={handleMonthClick}
    />
  );
};
