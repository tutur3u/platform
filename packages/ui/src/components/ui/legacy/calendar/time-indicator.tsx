import { TimeIndicatorLine } from './time-indicator-line';
import { isSameDay } from 'date-fns';

export const TimeIndicator = ({ dates }: { dates: Date[] }) => {
  const now = new Date();

  // Find the index of today's date in the dates array
  const todayIndex = dates.findIndex((date) => isSameDay(date, now));

  // Only render if today is in the visible dates
  if (todayIndex === -1) return null;

  return (
    <>
      {/* <TimeIndicatorText columnIndex={todayIndex} /> */}
      <TimeIndicatorLine columnIndex={todayIndex} columnsCount={dates.length} />
    </>
  );
};
