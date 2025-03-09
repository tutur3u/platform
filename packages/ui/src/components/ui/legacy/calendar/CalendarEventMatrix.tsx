import { useCalendar } from '../../../../hooks/use-calendar';
import EventCard from './EventCard';
import { DAY_HEIGHT, MAX_LEVEL } from './config';
import { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { useParams } from 'next/navigation';

const CalendarEventMatrix = ({ dates }: { dates: Date[] }) => {
  const params = useParams();
  const wsId = params?.wsId as string;
  const { getEvents } = useCalendar();

  // Get all events
  const allEvents = getEvents();

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

    // Create a map to store event levels
    const eventLevels = new Map<string, number>();

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

      // Assign levels
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

    // Return events with their assigned levels
    return sortedEvents.map((event) => ({
      ...event,
      _level: eventLevels.get(event.id) || 0,
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
