import { useCalendarClock } from '@tuturuuu/ui/hooks/use-calendar-clock';
import { calendarDayKey, calendarToday } from '../../../../lib/calendar-day';
import { useCalendarSettings } from './settings/settings-context';
import { TimeIndicatorLine } from './time-indicator-line';

export const TimeIndicator = ({ dates }: { dates: Date[] }) => {
  const { settings } = useCalendarSettings();
  const now = useCalendarClock();
  const todayKey = calendarDayKey(
    calendarToday(settings?.timezone?.timezone, now)
  );

  // Find the index of today's date in the dates array
  const todayIndex = dates.findIndex(
    (date) => calendarDayKey(date) === todayKey
  );

  // Only render if today is in the visible dates
  if (todayIndex === -1) return null;

  return (
    <>
      {/* <TimeIndicatorText columnIndex={todayIndex} /> */}
      <TimeIndicatorLine columnIndex={todayIndex} columnsCount={dates.length} />
    </>
  );
};
