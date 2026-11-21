import { useCalendarClock } from '@tuturuuu/ui/hooks/use-calendar-clock';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
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

dayjs.extend(utc);
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
  const scrolledRange = useRef<string | null>(null);
  const userScrolled = useRef(false);
  const aimedTop = useRef<number | null>(null);
  const { settings } = useCalendarSettings();
  const tz = settings?.timezone?.timezone;
  const now = useCalendarClock();
  const todayKey = calendarDayKey(calendarToday(tz, now));
  const showsToday = dates.some((date) => calendarDayKey(date) === todayKey);
  const workStartHour = earliestWorkStartHour(settings?.workHours);
  const rangeKey = `${dates.length}:${dates[0] ? calendarDayKey(dates[0]) : ''}`;
  // Settings that resolve after first paint (timezone, working hours) re-aim
  // the grid until the person scrolls it themselves.
  const scrollKey = `${rangeKey}|${tz ?? ''}|${workStartHour}`;

  // Position the grid before paint when the visible range opens, so the
  // working day (and now, when today is visible) is in view without a jump.
  useLayoutEffect(() => {
    const container = calendarViewRef.current;
    if (!container || scrolledFor.current === scrollKey) return;
    if (scrolledRange.current === rangeKey && userScrolled.current) return;
    const apply = () => {
      if (container.clientHeight === 0) return false;
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
      aimedTop.current = container.scrollTop;
      scrolledFor.current = scrollKey;
      if (scrolledRange.current !== rangeKey) userScrolled.current = false;
      scrolledRange.current = rangeKey;
      return true;
    };
    if (apply()) return;
    // Measure again once the grid has a height (hidden or still laying out).
    const observer = new ResizeObserver(() => {
      if (apply()) observer.disconnect();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [now, rangeKey, scrollKey, showsToday, tz, workStartHour]);

  return (
    <div
      ref={calendarViewRef}
      id="calendar-view"
      onScroll={(event) => {
        // Any scroll away from the aimed offset (wheel, touch, keys or the
        // scrollbar) is the person's own position.
        const top = event.currentTarget.scrollTop;
        if (aimedTop.current === null || Math.abs(top - aimedTop.current) > 1)
          userScrolled.current = true;
      }}
      className="flex h-full overflow-y-auto rounded-b-lg border-border border-b border-l text-center [scrollbar-width:thin]"
    >
      <TimeTrail />
      <CalendarView dates={dates} overlay={overlay} />
    </div>
  );
};
