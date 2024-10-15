'use client';

import { MonthView } from './month-view';
import { WorkspaceUserAttendance } from './utils';
import { YearView } from './year-view';
import { useEffect, useState } from 'react';

interface CalendarProps {
  locale: string;
  initialDate?: Date;
  attendanceData?: WorkspaceUserAttendance[];
  // eslint-disable-next-line no-unused-vars
  onDateClick?: (date: Date) => void;
  hideControls?: boolean;
  hideYear?: boolean;
}

export const Calendar: React.FC<CalendarProps> = ({
  locale,
  initialDate,
  attendanceData,
  onDateClick,
  hideControls = false,
  hideYear = false,
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
      onYearViewClick={handleYearViewClick}
      hideControls={hideControls}
      hideYear={hideYear}
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
