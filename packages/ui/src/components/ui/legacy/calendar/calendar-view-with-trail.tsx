import { useCalendarClock } from '@tuturuuu/ui/hooks/use-calendar-clock';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import { useLayoutEffect, useRef } from 'react';
import { calendarDayKey, calendarToday } from '../../../../lib/calendar-day';
import { CalendarView } from './calendar-view';
import { HOUR_HEIGHT } from './config';
import {
  earliestWorkStartHour,
  initialCalendarScrollTop,
} from './initial-scroll';
import { useCalendarSettings } from './settings/settings-context';
import { TimeTrail } from './time-trail';

dayjs.extend(timezone);

export const CalendarViewWithTrail = ({
  dates,
  overlay,
}: {
  dates: Date[];
  overlay?: React.ReactNode;
}) => {
  const calendarViewRef = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef<string | null>(null);
  const { settings } = useCalendarSettings();
  const tz = settings?.timezone?.timezone;
  const now = useCalendarClock();
  const todayKey = calendarDayKey(calendarToday(tz, now));
  const showsToday = dates.some((date) => calendarDayKey(date) === todayKey);
  const workStartHour = earliestWorkStartHour(settings?.workHours);
  const rangeKey = `${dates.length}:${dates[0] ? calendarDayKey(dates[0]) : ''}`;

  // Position the grid before paint when the visible range opens, so the
  // working day (and now, when today is visible) is in view without a jump.
  useLayoutEffect(() => {
    const container = calendarViewRef.current;
    if (!container || scrolledFor.current === rangeKey) return;
    scrolledFor.current = rangeKey;
    const nowTz = !tz || tz === 'auto' ? dayjs(now) : dayjs(now).tz(tz);
    container.scrollTo({
      top: initialCalendarScrollTop({
        hourHeight: HOUR_HEIGHT,
        nowHour: showsToday ? nowTz.hour() + nowTz.minute() / 60 : null,
        viewportHeight: container.clientHeight,
        workStartHour,
      }),
      behavior: 'instant',
    });
  }, [now, rangeKey, showsToday, tz, workStartHour]);

  return (
    <div
      ref={calendarViewRef}
      id="calendar-view"
      className="flex h-full overflow-y-auto rounded-b-lg border-border border-b border-l text-center [scrollbar-width:thin]"
    >
      <TimeTrail />
      <CalendarView dates={dates} overlay={overlay} />
    </div>
  );
};
