import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import { useEffect, useRef, useState } from 'react';
import { useCalendar } from '../../../../hooks/use-calendar';
import { CalendarView } from './calendar-view';
import { HOUR_HEIGHT } from './config';
import { TimeTrail } from './time-trail';

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
  }, [dates, initialized, tz]);

  return (
    <div
      ref={calendarViewRef}
      id="calendar-view"
      className="flex h-full overflow-y-auto scroll-smooth rounded-b-lg border-b border-l border-border text-center dark:border-zinc-800"
      style={{
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(0,0,0,0.2) transparent',
      }}
    >
      <TimeTrail />
      <CalendarView dates={dates} />
    </div>
  );
};
