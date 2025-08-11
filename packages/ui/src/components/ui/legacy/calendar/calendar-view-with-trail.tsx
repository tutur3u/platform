import { useCalendar } from '../../../../hooks/use-calendar';
import { CalendarView } from './calendar-view';
import { HOUR_HEIGHT } from './config';
import { TimeTrail } from './time-trail';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import { useEffect, useRef, useState } from 'react';

dayjs.extend(timezone);

export const CalendarViewWithTrail = ({ dates }: { dates: Date[] }) => {
  const [initialized, setInitialized] = useState(false);
  const calendarViewRef = useRef<HTMLDivElement>(null);
  const { settings } = useCalendar();
  const tz = settings?.timezone?.timezone;

  // Scroll to current time on mount and when dates change
  useEffect(() => {
    if (!initialized && calendarViewRef.current) {
      const now = tz === 'auto' ? dayjs() : dayjs().tz(tz);
      const scrollY =
        now.hour() * HOUR_HEIGHT + (now.minute() / 60) * HOUR_HEIGHT;
      calendarViewRef.current.scrollTop = scrollY - 100;
      setInitialized(true);
    }
  }, [initialized, tz]);

  return (
    <div
      ref={calendarViewRef}
      id="calendar-view"
      className="scrollbar-none flex h-full overflow-y-auto scroll-smooth rounded-b-lg text-center dark:text-zinc-200"
    >
      <TimeTrail />
      <CalendarView dates={dates} />
    </div>
  );
};
