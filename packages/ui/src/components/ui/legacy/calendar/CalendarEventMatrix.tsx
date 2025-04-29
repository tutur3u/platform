import { useCalendar } from '../../../../hooks/use-calendar';
import EventCard from './EventCard';
import { DAY_HEIGHT, MAX_LEVEL } from './config';
import { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { useParams } from 'next/navigation';

const CalendarEventMatrix = ({ dates }: { dates: Date[] }) => {
  const params = useParams();
  const wsId = params?.wsId as string;
  const { eventsWithoutAllDays } = useCalendar();

  // Get all events
  const allEvents = eventsWithoutAllDays;

  // Process events to handle multi-day events
  const processedEvents = allEvents.flatMap((event) => {
    // Parse dates with proper timezone handling
    const eventStart = new Date(event.start_at);
    const eventEnd = new Date(event.end_at);

    // Ensure end time is after start time
    if (eventEnd <= eventStart) {
      // Fix invalid event by setting end time to 1 hour after start
      eventEnd.setTime(eventStart.getTime() + 60 * 60 * 1000);
    }

    // Normalize dates to compare just the date part (ignoring time)
    const startDay = new Date(
      eventStart.getFullYear(),
      eventStart.getMonth(),
      eventStart.getDate()
    );

    const endDay = new Date(
      eventEnd.getFullYear(),
      eventEnd.getMonth(),
      eventEnd.getDate()
    );

    // If start and end are on the same day, return the original event
    if (startDay.getTime() === endDay.getTime()) {
      return [
        {
          ...event,
          // Ensure start and end times are valid
          start_at: eventStart.toISOString(),
          end_at: eventEnd.toISOString(),
        },
      ];
    }

    // For multi-day events, create a separate instance for each day
    const splitEvents: CalendarEvent[] = [];
    let currentDay = new Date(startDay);

    // Iterate through each day of the event
    while (currentDay.getTime() <= endDay.getTime()) {
      // Create date objects for the current day's boundaries
      const dayStart = new Date(
        currentDay.getFullYear(),
        currentDay.getMonth(),
        currentDay.getDate(),
        0,
        0,
        0
      );

      const dayEnd = new Date(
        currentDay.getFullYear(),
        currentDay.getMonth(),
        currentDay.getDate(),
        23,
        59,
        59
      );

      // Create a new event instance for this day
      const dayEvent: CalendarEvent = {
        ...event,
        _originalId: event.id,
        id: `${event.id}-${currentDay.toISOString().split('T')[0]}`,
        _isMultiDay: true,
        _dayPosition:
          currentDay.getTime() === startDay.getTime()
            ? 'start'
            : currentDay.getTime() === endDay.getTime()
              ? 'end'
              : 'middle',
      };

      // Adjust start and end times for this day's instance
      if (currentDay.getTime() === startDay.getTime()) {
        // First day - keep original start time, end at midnight
        dayEvent.start_at = eventStart.toISOString();
        dayEvent.end_at = dayEnd.toISOString();
      } else if (currentDay.getTime() === endDay.getTime()) {
        // Last day - start at midnight, keep original end time
        dayEvent.start_at = dayStart.toISOString();
        dayEvent.end_at = eventEnd.toISOString();
      } else {
        // Middle days - full day from midnight to midnight
        dayEvent.start_at = dayStart.toISOString();
        dayEvent.end_at = dayEnd.toISOString();
      }

      splitEvents.push(dayEvent);

      // Move to the next day
      const nextDay = new Date(currentDay);
      nextDay.setDate(nextDay.getDate() + 1);
      currentDay = nextDay;
    }

    return splitEvents;
  });

  // Filter events to only include those visible in the current date range
  const visibleEvents = processedEvents.filter((event) => {
    const eventStart = new Date(event.start_at);
    const eventStartDay = new Date(
      eventStart.getFullYear(),
      eventStart.getMonth(),
      eventStart.getDate()
    );

    // Check if the event falls within any of the visible dates
    return dates.some((date) => {
      const dateDay = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
      );
      return dateDay.getTime() === eventStartDay.getTime();
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

      // Now assign overlap information to each event
      overlapGroups.forEach((group) => {
        const eventIds = group.map((event) => event.id);

        // For each event in the group, store the group and count
        group.forEach((event) => {
          eventOverlapCounts.set(event.id, group.length);
          eventOverlapGroups.set(event.id, eventIds);
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

export default CalendarEventMatrix;
