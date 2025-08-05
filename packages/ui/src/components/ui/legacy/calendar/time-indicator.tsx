import { TimeIndicatorLine } from './time-indicator-line';
import { isSameDay } from 'date-fns';

export const TimeIndicator = ({ dates }: { dates: Date[] }) => {
  const now = new Date();

  // Find the index of today's date in the dates array
  const todayIndex = dates.findIndex((date) => isSameDay(date, now));

  // For 4-day view, if today is not in the visible dates, don't show the indicator
  // This prevents showing the timeline indicator when viewing a different 4-day period
  if (todayIndex === -1) return null;

  return (
    <>
      {/* <TimeIndicatorText columnIndex={todayIndex} /> */}
      <TimeIndicatorLine columnIndex={todayIndex} columnsCount={dates.length} />
    </>
  );
};
