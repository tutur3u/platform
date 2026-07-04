import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { useCalendar } from '@tuturuuu/ui/hooks/use-calendar';
import { useCalendarSync } from '@tuturuuu/ui/hooks/use-calendar-sync';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import { useParams } from 'next/navigation';
import { useMemo } from 'react';
import { CalendarColumn } from './calendar-column';
import { DAY_HEIGHT, MAX_LEVEL } from './config';
import { EventCard } from './event-card';
import { processCalendarEvent } from './event-utils';
import { useCalendarSettings } from './settings/settings-context';

dayjs.extend(timezone);

type LayoutCalendarEvent = CalendarEvent & {
  _dayKey: string;
  _endMs: number;
  _startMs: number;
};

function getDayKeyFromDate(date: Date, tz?: string) {
  return (tz === 'auto' ? dayjs(date) : dayjs(date).tz(tz)).format(
    'YYYY-MM-DD'
  );
}

function getDayKeyFromIso(value: string, tz?: string) {
  return (tz === 'auto' ? dayjs(value) : dayjs(value).tz(tz)).format(
    'YYYY-MM-DD'
  );
}

function withLayoutMetadata(
  event: CalendarEvent,
  tz?: string
): LayoutCalendarEvent {
  return {
    ...event,
    _dayKey: getDayKeyFromIso(event.start_at, tz),
    _endMs: new Date(event.end_at).getTime(),
    _startMs: new Date(event.start_at).getTime(),
  };
}

function assignEventLayout(
  visibleEvents: CalendarEvent[],
  tz?: string
): CalendarEvent[] {
  const sortedEvents = visibleEvents
    .map((event) => withLayoutMetadata(event, tz))
    .sort((left, right) => left._startMs - right._startMs);

  const eventLevels = new Map<string, number>();
  const eventOverlapCounts = new Map<string, number>();
  const eventOverlapGroups = new Map<string, string[]>();
  const eventColumns = new Map<string, number>();
  const eventsByDay = new Map<string, LayoutCalendarEvent[]>();

  for (const event of sortedEvents) {
    const dayEvents = eventsByDay.get(event._dayKey) ?? [];
    dayEvents.push(event);
    eventsByDay.set(event._dayKey, dayEvents);
  }

  for (const dayEvents of eventsByDay.values()) {
    const sortedDayEvents = [...dayEvents].sort(
      (left, right) => left._startMs - right._startMs
    );

    const overlapGroups: LayoutCalendarEvent[][] = [];
    let activeGroup: LayoutCalendarEvent[] = [];
    let activeGroupEnd = Number.NEGATIVE_INFINITY;

    for (const event of sortedDayEvents) {
      if (activeGroup.length === 0 || event._startMs < activeGroupEnd) {
        activeGroup.push(event);
        activeGroupEnd = Math.max(activeGroupEnd, event._endMs);
      } else {
        overlapGroups.push(activeGroup);
        activeGroup = [event];
        activeGroupEnd = event._endMs;
      }
    }

    if (activeGroup.length > 0) overlapGroups.push(activeGroup);

    for (const group of overlapGroups) {
      const sortedGroup = [...group].sort((left, right) => {
        if (left._startMs !== right._startMs)
          return left._startMs - right._startMs;
        return right._endMs - right._startMs - (left._endMs - left._startMs);
      });

      const groupEventColumns = new Map<string, number>();
      const columnEndTimes: number[] = [];

      for (const event of sortedGroup) {
        let column = columnEndTimes.findIndex(
          (columnEndTime) => event._startMs >= columnEndTime
        );

        if (column === -1) column = columnEndTimes.length;

        groupEventColumns.set(event.id, column);
        columnEndTimes[column] = event._endMs;
      }

      const maxColumn = Math.max(0, ...groupEventColumns.values());
      const orderedEventIds: string[] = [];

      for (let column = 0; column <= maxColumn; column++) {
        const columnEvents = sortedGroup
          .filter((event) => groupEventColumns.get(event.id) === column)
          .sort(
            (left, right) =>
              right._endMs - right._startMs - (left._endMs - left._startMs)
          );
        orderedEventIds.push(...columnEvents.map((event) => event.id));
      }

      for (const event of sortedGroup) {
        eventOverlapCounts.set(event.id, sortedGroup.length);
        eventOverlapGroups.set(event.id, orderedEventIds);
        eventColumns.set(event.id, groupEventColumns.get(event.id) ?? 0);
      }
    }

    const levelEndTimes: number[] = [];

    for (const event of sortedDayEvents) {
      let level = 0;
      while (
        level < MAX_LEVEL &&
        levelEndTimes[level] !== undefined &&
        event._startMs < levelEndTimes[level]!
      ) {
        level++;
      }

      level = Math.min(level, MAX_LEVEL - 1);
      eventLevels.set(event.id, level);
      levelEndTimes[level] = event._endMs;
    }
  }

  return sortedEvents.map((event) => ({
    ...event,
    _column: eventColumns.get(event.id) ?? 0,
    _level: eventLevels.get(event.id) ?? 0,
    _overlapCount: eventOverlapCounts.get(event.id) ?? 1,
    _overlapGroup: eventOverlapGroups.get(event.id) ?? [event.id],
  }));
}

export const CalendarMatrix = ({
  dates,
  overlay,
}: {
  dates: Date[];
  overlay?: React.ReactNode;
}) => {
  return (
    <>
      <CalendarBaseMatrix dates={dates} />
      <CalendarEventMatrix dates={dates} />
      {overlay && (
        <div className="pointer-events-none absolute inset-0 z-50">
          {overlay}
        </div>
      )}
    </>
  );
};

export const CalendarBaseMatrix = ({ dates }: { dates: Date[] }) => {
  return (
    <>
      {dates.map((_, index) => (
        <CalendarColumn
          key={`cal-col-${index}`}
          date={dayjs(dates[index]!).format('YYYY-MM-DD')}
          last={index === dates.length - 1}
        />
      ))}
    </>
  );
};

export const CalendarEventMatrix = ({ dates }: { dates: Date[] }) => {
  const params = useParams();
  const wsId = params?.wsId as string;
  const { settings } = useCalendarSettings();
  const { eventsWithoutAllDays } = useCalendarSync();
  const { previewEvents, hideNonPreviewEvents, affectedEventIds } =
    useCalendar();
  const tz = settings?.timezone?.timezone;

  const visibleDayKeys = useMemo(
    () => new Set(dates.map((date) => getDayKeyFromDate(date, tz))),
    [dates, tz]
  );

  const filteredRealEvents = useMemo(
    () =>
      hideNonPreviewEvents
        ? eventsWithoutAllDays.filter(
            (event) => !affectedEventIds.has(event.id) || event._isPreview
          )
        : eventsWithoutAllDays,
    [affectedEventIds, eventsWithoutAllDays, hideNonPreviewEvents]
  );

  const allEvents = useMemo(() => {
    const realEventIds = new Set(filteredRealEvents.map((event) => event.id));
    const filteredPreviewEvents = previewEvents.filter(
      (event) => !realEventIds.has(event.id)
    );
    return [...filteredRealEvents, ...filteredPreviewEvents];
  }, [filteredRealEvents, previewEvents]);

  const visibleEvents = useMemo(() => {
    const nextVisibleEvents: CalendarEvent[] = [];

    for (const event of allEvents) {
      for (const processedEvent of processCalendarEvent(event, tz)) {
        if (visibleDayKeys.has(getDayKeyFromIso(processedEvent.start_at, tz))) {
          nextVisibleEvents.push(processedEvent);
        }
      }
    }

    return nextVisibleEvents;
  }, [allEvents, tz, visibleDayKeys]);

  const eventsWithLevels = useMemo(
    () => assignEventLayout(visibleEvents, tz),
    [visibleEvents, tz]
  );

  const columns = dates.length;

  return (
    <div
      className={`pointer-events-none absolute inset-0 grid ${
        columns === 1 ? 'max-w-lg' : ''
      }`}
      style={{
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        height: `${DAY_HEIGHT}px`, // Ensure container is exactly 24 hours high
      }}
    >
      <div id="calendar-event-matrix" className="relative col-span-full">
        {eventsWithLevels.map((event) => (
          <EventCard
            wsId={wsId}
            key={event.id}
            event={event}
            dates={dates}
            level={event._level}
          />
        ))}
      </div>
    </div>
  );
};
