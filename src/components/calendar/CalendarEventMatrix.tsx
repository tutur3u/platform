import { useCallback, useEffect, useState } from 'react';
import mockEvents from '../../data/events';
import { useCalendar } from '../../hooks/useCalendar';
import { CalendarEvent } from '../../types/primitives/CalendarEvent';
import CalendarEventColumn from './CalendarEventColumn';

const CalendarEventMatrix = () => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  useEffect(() => {
    setEvents(mockEvents);
  }, []);

  const { getDatesInView } = useCalendar();

  const dates = getDatesInView();
  const columns = dates.length;

  const convertToColumns = () => {
    const eventsOnCalendar = dates.map((day) => {
      const eventsOnDay = events.filter((event) => {
        if (event.start_at.getDate() === day.getDate()) return true;
        return false;
      });

      return {
        date: day,
        events: eventsOnDay,
      };
    });

    return eventsOnCalendar;
  };

  const handleEventUpdate = (event: CalendarEvent) => {
    setEvents((prev) => {
      // sort by start date and duration
      const newEvents = [...prev].sort(
        (a, b) => a.start_at.getTime() - b.start_at.getTime()
      );

      newEvents.forEach((t) => {
        if (t.id === event.id) {
          t.title = event.title;
          t.start_at = event.start_at;
          t.end_at = event.end_at;
        }

        t.level = getEventLevel(t);
      });
      return newEvents;
    });
  };

  const getEventLevel = useCallback(
    (event: CalendarEvent) => {
      // Find index of event in events array
      const eventIndex = events.findIndex((t) => t.id === event.id);

      // If event is first in the list, it has no level
      if (eventIndex === 0) return 0;

      const eventsBefore = events.slice(0, eventIndex);
      const eventsBeforeChained = eventsBefore.filter((t) => {
        const eventStart = event.start_at.getTime();
        const eventEnd = event.end_at.getTime();

        const tStart = t.start_at.getTime();
        const tEnd = t.end_at.getTime();

        if (tStart >= eventStart && tStart < eventEnd) return true;
        if (tEnd > eventStart && tEnd <= eventEnd) return true;
        if (tStart <= eventStart && tEnd >= eventEnd) return true;

        return false;
      });

      if (eventsBeforeChained.length === 0) return 0;

      const eventsBeforeChainedLevels = eventsBeforeChained.map(
        (t) => t?.level ?? 0
      );
      const maxLevel = Math.max(...eventsBeforeChainedLevels);
      return maxLevel + 1;
    },
    [events]
  );

  const eventColumns = convertToColumns();

  const placedColumns = eventColumns
    ? eventColumns.map((col) => (
        <CalendarEventColumn
          key={col.date.toString()}
          events={col.events}
          getEventLevel={getEventLevel}
          onUpdated={handleEventUpdate}
        />
      ))
    : null;

  return (
    <div
      className={`absolute inset-0 grid grid-cols-${columns} ${
        dates.length === 1 && 'max-w-lg'
      }`}
    >
      {placedColumns}
    </div>
  );
};

export default CalendarEventMatrix;
