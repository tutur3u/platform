import { convertScheduledEventToCalendarEvent } from '../../../../hooks/scheduled-events-utils';
import { CalendarColumn } from './calendar-column';
import { DAY_HEIGHT, MAX_LEVEL } from './config';
import { EventCard } from './event-card';
import { useCalendarSettings } from './settings/settings-context';
import type { WorkspaceScheduledEventWithAttendees } from '@tuturuuu/types/primitives/RSVP';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { useCalendarSync } from '@tuturuuu/ui/hooks/use-calendar-sync';
import { useCurrentUser } from '@tuturuuu/ui/hooks/use-current-user';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import timezone from 'dayjs/plugin/timezone';
import { useParams } from 'next/navigation';
import React from 'react';

dayjs.extend(timezone);
dayjs.extend(isSameOrBefore);

export const CalendarMatrix = ({
  dates,
  onOpenEventDetails,
}: {
  dates: Date[];
  onOpenEventDetails?: (
    eventId: string,
    scheduledEvent?: WorkspaceScheduledEventWithAttendees
  ) => void;
}) => {
  return (
    <>
      <CalendarBaseMatrix dates={dates} />
      <CalendarEventMatrix
        dates={dates}
        onOpenEventDetails={onOpenEventDetails}
      />
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

export const CalendarEventMatrix = ({
  dates,
  onOpenEventDetails,
}: {
  dates: Date[];
  onOpenEventDetails?: (
    eventId: string,
    scheduledEvent?: WorkspaceScheduledEventWithAttendees
  ) => void;
}) => {
  const params = useParams();
  const wsId = params?.wsId as string;
  const { settings } = useCalendarSettings();
  const { eventsWithoutAllDays, scheduledEvents } = useCalendarSync();
  const { userId: currentUserId } = useCurrentUser();
  const tz = settings?.timezone?.timezone;
  const tzId = tz && tz !== 'auto' ? tz : null;

  // Get all events
  const allEvents = eventsWithoutAllDays;

  // Convert scheduled events to calendar events - memoized
  const scheduledCalendarEvents = React.useMemo(() => {
    const events: CalendarEvent[] = [];
    if (currentUserId && scheduledEvents) {
      scheduledEvents.forEach((scheduledEvent) => {
        try {
          const calendarEvent = convertScheduledEventToCalendarEvent(
            scheduledEvent,
            currentUserId
          );
          if (calendarEvent) {
            events.push(calendarEvent);
          }
        } catch (error) {
          console.error('Error converting scheduled event:', error);
        }
      });
    }
    return events;
  }, [scheduledEvents, currentUserId]);

  // Combine regular events with scheduled events - memoized
  const combinedEvents = React.useMemo(() => {
    return [...allEvents, ...scheduledCalendarEvents];
  }, [allEvents, scheduledCalendarEvents]);

  // Process events to handle multi-day events - memoized
  const processedEvents = React.useMemo(() => {
    return combinedEvents.flatMap((event) => {
      // Parse dates with proper timezone handling
      const startDay = tzId
        ? dayjs(event.start_at).tz(tzId)
        : dayjs(event.start_at);
      const endDay = tzId ? dayjs(event.end_at).tz(tzId) : dayjs(event.end_at);

      // Ensure end time is after start time
      if (endDay.isBefore(startDay)) {
        // Fix invalid event by setting end time to 1 hour after start
        return [{ ...event, end_at: startDay.add(1, 'hour').toISOString() }];
      }

      // Normalize dates to compare just the date part (ignoring time)
      const startDayNormalized = startDay.startOf('day');
      const endDayNormalized = endDay.startOf('day');

      // If start and end are on the same day, return the original event
      if (startDayNormalized.isSame(endDayNormalized)) {
        return [
          {
            ...event,
            start_at: startDay.toISOString(),
            end_at: endDay.toISOString(),
          },
        ];
      }

      // For multi-day events, create a separate instance for each day
      const splitEvents: CalendarEvent[] = [];
      let currentDay = startDayNormalized.clone();

      // Iterate through each day of the event
      while (currentDay.isSameOrBefore(endDayNormalized)) {
        const dayStart = currentDay.startOf('day');
        const dayEnd = currentDay.endOf('day');

        const dayEvent: CalendarEvent = {
          ...event,
          _originalId: event.id,
          id: `${event.id}-${currentDay.format('YYYY-MM-DD')}`,
          _isMultiDay: true,
          _dayPosition: currentDay.isSame(startDayNormalized)
            ? 'start'
            : currentDay.isSame(endDayNormalized)
              ? 'end'
              : 'middle',
        };

        if (currentDay.isSame(startDayNormalized)) {
          dayEvent.start_at = startDay.toISOString();
          dayEvent.end_at = dayEnd.toISOString();
        } else if (currentDay.isSame(endDayNormalized)) {
          dayEvent.start_at = dayStart.toISOString();
          dayEvent.end_at = endDay.toISOString();
        } else {
          dayEvent.start_at = dayStart.toISOString();
          dayEvent.end_at = dayEnd.toISOString();
        }

        splitEvents.push(dayEvent);
        currentDay = currentDay.add(1, 'day');
      }

      return splitEvents;
    });
  }, [combinedEvents, tzId]);

  // Filter events to only include those visible in the current date range - memoized
  const visibleEvents = React.useMemo(() => {
    return processedEvents.filter((event) => {
      const eventStart = tzId
        ? dayjs(event.start_at).tz(tzId)
        : dayjs(event.start_at);
      const eventStartDay = eventStart.startOf('day');

      // Check if the event falls within any of the visible dates
      return dates.some((date) => {
        const dateDay = tzId
          ? dayjs(date).tz(tzId).startOf('day')
          : dayjs(date).startOf('day');
        return dateDay.isSame(eventStartDay);
      });
    });
  }, [processedEvents, dates, tzId]);

  // Simple algorithm to assign levels to events - memoized
  const eventsWithLevels = React.useMemo(() => {
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
  }, [visibleEvents]);

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
            scheduledEvents={scheduledEvents ?? []}
            currentUserId={currentUserId || ''}
            onOpenEventDetails={onOpenEventDetails}
          />
        ))}
      </div>
    </div>
  );
};
