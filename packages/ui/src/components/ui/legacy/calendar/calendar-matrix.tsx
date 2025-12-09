import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { useCalendar } from '@tuturuuu/ui/hooks/use-calendar';
import { useCalendarSync } from '@tuturuuu/ui/hooks/use-calendar-sync';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import { useParams } from 'next/navigation';
import { CalendarColumn } from './calendar-column';
import { DAY_HEIGHT, MAX_LEVEL } from './config';
import { EventCard } from './event-card';
import { processCalendarEvent } from './event-utils';
import { useCalendarSettings } from './settings/settings-context';

dayjs.extend(timezone);

export const CalendarMatrix = ({ dates }: { dates: Date[] }) => {
  return (
    <>
      <CalendarBaseMatrix dates={dates} />
      <CalendarEventMatrix dates={dates} />
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
  const { previewEvents } = useCalendar();
  const tz = settings?.timezone?.timezone;

  // Merge real events with preview events for visual demo
  const allEvents = [...eventsWithoutAllDays, ...previewEvents];

  // Process events to handle multi-day events
  // Events ending at exactly midnight are treated as ending on the previous day
  const processedEvents = allEvents.flatMap((event) =>
    processCalendarEvent(event, tz)
  );

  // Filter events to only include those visible in the current date range
  const visibleEvents = processedEvents.filter((event) => {
    const eventStart =
      tz === 'auto' ? dayjs(event.start_at) : dayjs(event.start_at).tz(tz);
    const eventStartDay = eventStart.startOf('day');

    // Check if the event falls within any of the visible dates
    return dates.some((date) => {
      const dateDay =
        tz === 'auto'
          ? dayjs(date).startOf('day')
          : dayjs(date).tz(tz).startOf('day');
      return dateDay.isSame(eventStartDay);
    });
  });

  // Simple algorithm to assign levels to events
  const assignLevels = () => {
    // Sort events by start time
    const sortedEvents = [...visibleEvents].sort((a, b) => {
      const aStart = new Date(a.start_at).getTime();
      const bStart = new Date(b.start_at).getTime();
      return aStart - bStart;
    });

    // Create maps to store event data
    const eventLevels = new Map<string, number>();
    const eventOverlapCounts = new Map<string, number>();
    const eventOverlapGroups = new Map<string, string[]>();
    const eventColumns = new Map<string, number>();

    // Group events by day
    const eventsByDay = new Map<string, CalendarEvent[]>();

    // Populate the day groups
    sortedEvents.forEach((event) => {
      const date = new Date(event.start_at);
      const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

      if (!eventsByDay.has(dateKey)) {
        eventsByDay.set(dateKey, []);
      }

      const dayEvents = eventsByDay.get(dateKey);
      if (dayEvents) {
        dayEvents.push(event);
      }
    });

    // Process each day's events
    eventsByDay.forEach((dayEvents) => {
      // Sort by start time
      const sortedDayEvents = [...dayEvents].sort((a, b) => {
        const aStart = new Date(a.start_at).getTime();
        const bStart = new Date(b.start_at).getTime();
        return aStart - bStart;
      });

      // Track end times for each level
      const levelEndTimes: number[] = [];

      // Create a more accurate grouping of overlapping events
      // Helper function to check if two events overlap
      const eventsOverlap = (event1: CalendarEvent, event2: CalendarEvent) => {
        const event1Start = new Date(event1.start_at).getTime();
        const event1End = new Date(event1.end_at).getTime();
        const event2Start = new Date(event2.start_at).getTime();
        const event2End = new Date(event2.end_at).getTime();

        return event1Start < event2End && event1End > event2Start;
      };

      // Create overlap groups
      const overlapGroups: CalendarEvent[][] = [];

      // Process each event to find its overlap group
      sortedDayEvents.forEach((event) => {
        // Find all groups this event overlaps with
        const overlappingGroupIndices: number[] = [];

        for (let i = 0; i < overlapGroups.length; i++) {
          const group = overlapGroups[i];
          // Check if event overlaps with any event in this group
          if (group?.some((groupEvent) => eventsOverlap(event, groupEvent))) {
            overlappingGroupIndices.push(i);
          }
        }

        if (overlappingGroupIndices.length === 0) {
          // No overlapping groups, create a new one
          overlapGroups.push([event]);
        } else {
          // Merge all overlapping groups and add this event
          const newGroup = [event];

          // Sort indices in descending order to safely remove from array
          overlappingGroupIndices.sort((a, b) => b - a);

          // Merge all overlapping groups
          overlappingGroupIndices.forEach((index) => {
            newGroup.push(...(overlapGroups[index] ?? []));
            overlapGroups.splice(index, 1);
          });

          // Add the merged group
          overlapGroups.push(newGroup);
        }
      });

      // Now assign column positions using a graph coloring approach
      overlapGroups.forEach((group) => {
        // For each group, assign column positions
        // Column 0 = all non-overlapping events with each other
        // Column 1+ = events that overlap with column 0

        // Sort group by start time, then duration (longest first)
        const sortedGroup = [...group].sort((a, b) => {
          const aStart = new Date(a.start_at).getTime();
          const bStart = new Date(b.start_at).getTime();
          if (aStart !== bStart) return aStart - bStart;

          const aDuration =
            new Date(a.end_at).getTime() - new Date(a.start_at).getTime();
          const bDuration =
            new Date(b.end_at).getTime() - new Date(b.start_at).getTime();

          // Longer events first
          return bDuration - aDuration;
        });

        // Assign columns using greedy coloring
        const groupEventColumns = new Map<string, number>();
        const columnEndTimes: number[] = [];

        sortedGroup.forEach((event) => {
          const eventStart = new Date(event.start_at).getTime();
          const eventEnd = new Date(event.end_at).getTime();

          // Find the first column where this event can fit
          let column = -1;
          for (let i = 0; i < columnEndTimes.length; i++) {
            if (eventStart >= columnEndTimes[i]!) {
              column = i;
              break;
            }
          }

          // If no existing column works, create a new one
          if (column === -1) {
            column = columnEndTimes.length;
          }

          groupEventColumns.set(event.id, column);
          columnEndTimes[column] = eventEnd;
        });

        // Now create the ordered list based on column assignment
        // Column 0 events first (sorted by duration), then column 1, etc.
        const maxColumn = Math.max(...Array.from(groupEventColumns.values()));
        const orderedEventIds: string[] = [];

        for (let col = 0; col <= maxColumn; col++) {
          const colEvents = sortedGroup
            .filter((e) => groupEventColumns.get(e.id) === col)
            .sort((a, b) => {
              const aDuration =
                new Date(a.end_at).getTime() - new Date(a.start_at).getTime();
              const bDuration =
                new Date(b.end_at).getTime() - new Date(b.start_at).getTime();
              return bDuration - aDuration; // Longest first
            });
          orderedEventIds.push(...colEvents.map((e) => e.id));
        }

        // For each event in the group, store the ordered group and column number
        sortedGroup.forEach((event) => {
          eventOverlapCounts.set(event.id, sortedGroup.length);
          eventOverlapGroups.set(event.id, orderedEventIds);
          eventColumns.set(event.id, groupEventColumns.get(event.id) || 0);
        });
      });

      // Assign levels (for fallback positioning) using the original algorithm
      sortedDayEvents.forEach((event) => {
        const eventStart = new Date(event.start_at).getTime();

        // Find the first level where this event can fit
        let level = 0;
        while (level < MAX_LEVEL) {
          if (
            !levelEndTimes[level] ||
            eventStart >= (levelEndTimes?.[level] ?? 0)
          ) {
            break;
          }
          level++;
        }

        // Cap at maximum level
        level = Math.min(level, MAX_LEVEL - 1);

        // Store the level for this event
        eventLevels.set(event.id, level);

        // Update the end time for this level
        levelEndTimes[level] = new Date(event.end_at).getTime();
      });
    });

    // Return events with assigned levels and overlap information
    return sortedEvents.map((event) => ({
      ...event,
      _level: eventLevels.get(event.id) || 0,
      _overlapCount: eventOverlapCounts.get(event.id) || 1,
      _overlapGroup: eventOverlapGroups.get(event.id) || [event.id],
      _column: eventColumns.get(event.id) || 0,
    }));
  };

  // Get events with levels assigned
  const eventsWithLevels = assignLevels();

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
