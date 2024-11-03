import { Separator } from '../../separator';
import { TooltipProvider } from '../../tooltip';
import { DayCell } from './day-cell';
import { MonthHeader } from './month-header';
import { WorkspaceUserAttendance } from './utils';
import { startOfDay } from 'date-fns';
import { useMemo } from 'react';

export const MonthView: React.FC<{
  locale: string;
  currentDate: Date;
  setCurrentDate: React.Dispatch<React.SetStateAction<Date>>;
  attendanceData?: WorkspaceUserAttendance[];
  // eslint-disable-next-line no-unused-vars
  onDateClick?: (date: Date) => void;
  onYearViewClick: () => void;
  hideControls?: boolean;
  hideYear?: boolean;
}> = ({
  locale,
  currentDate,
  setCurrentDate,
  attendanceData,
  onDateClick,
  onYearViewClick,
  hideControls = false,
  hideYear = false,
}) => {
  const thisYear = currentDate.getFullYear();
  const thisMonth = currentDate.toLocaleString(locale, {
    month: hideYear ? 'long' : '2-digit',
  });
  const today = startOfDay(new Date());

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        let newDay = new Date(currentDate);
        newDay.setDate(currentDate.getDate() - currentDate.getDay() + i + 1);
        return newDay.toLocaleString(locale, { weekday: 'narrow' });
      }),
    [currentDate, locale]
  );

  const daysInMonth = useMemo(
    () =>
      Array.from({ length: 42 }, (_, i) => {
        let newDay = new Date(
          currentDate.getFullYear(),
          currentDate.getMonth(),
          1
        );
        let dayOfWeek = newDay.getDay();
        let adjustment = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        newDay.setDate(newDay.getDate() - adjustment + i);
        return newDay;
      }),
    [currentDate]
  );

  const handlePrev = () =>
    setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)));
  const handleNext = () =>
    setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)));

  return (
    <div>
      <MonthHeader
        thisYear={thisYear}
        thisMonth={thisMonth}
        handlePrev={handlePrev}
        handleNext={handleNext}
        currentDate={currentDate}
        onYearViewClick={onYearViewClick}
        hideControls={hideControls}
        hideYear={hideYear}
      />

      {hideControls && <Separator className="my-2" />}

      <div className="relative grid gap-1 text-xs md:gap-2 md:text-base">
        <div className="grid grid-cols-7 gap-1 md:gap-2">
          {days.map((day, idx) => (
            <div
              key={`day-${idx}`}
              className="bg-foreground/5 flex flex-none cursor-default justify-center rounded p-2 font-semibold transition duration-300 md:rounded-lg"
            >
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1 md:gap-2">
          <TooltipProvider delayDuration={0}>
            {daysInMonth.map((day, idx) => (
              <DayCell
                key={`day-${idx}`}
                day={day}
                currentDate={currentDate}
                today={today}
                attendanceData={attendanceData}
                onDateClick={onDateClick}
              />
            ))}
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
};
