import { useEffect, useState } from 'react';
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

  const handleEventUpdate = (eventId: string, data: Partial<CalendarEvent>) =>
    setEvents((prev) =>
      prev
        .map((e) => (e.id === eventId ? { ...e, ...data } : e))
        .sort((a, b) => {
          if (a.start_at < b.start_at) return -1;
          if (a.start_at > b.start_at) return 1;
          if (a.end_at < b.end_at) return 1;
          if (a.end_at > b.end_at) return -1;
          return 0;
        })
    );

  const getEventLevel = (events: CalendarEvent[], eventId: string): number => {
    const event = events.find((e) => e.id === eventId);
    if (!event) return 0;

    const eventIndex = events.findIndex((e) => e.id === eventId);

    const prevEvents = events.slice(0, eventIndex).filter((e) => {
      // If the event is the same
      if (e.id === eventId) return false;

      // If the event is not on the same day
      if (e.start_at.getDate() !== event.start_at.getDate()) return false;

      // If the event ends before the current event starts,
      // or if the event starts after the current event ends
      if (e.end_at <= event.start_at || e.start_at >= event.end_at)
        return false;

      return true;
    });

    if (prevEvents.length === 0) return 0;

    const prevEventLevels = prevEvents.map((e) => getEventLevel(events, e.id));
    return Math.max(...prevEventLevels) + 1;
  };

  const eventColumns = convertToColumns();

  const placedColumns = eventColumns
    ? eventColumns.map((col) => (
        <CalendarEventColumn
          key={col.date.toString()}
          events={col.events}
          getEventLevel={(id) => getEventLevel(events, id)}
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
