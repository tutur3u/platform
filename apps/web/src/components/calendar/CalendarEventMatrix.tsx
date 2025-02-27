import EventCard from './EventCard';
import { useCalendar } from '@/hooks/useCalendar';
import { useParams } from 'next/navigation';

const CalendarEventMatrix = ({ dates }: { dates: Date[] }) => {
  const params = useParams();
  const wsId = params?.wsId as string;
  const { getEvents } = useCalendar();

  // Get all events and filter them based on the visible dates
  const allEvents = getEvents();
  const visibleEvents = allEvents.filter((event) => {
    const eventStart = new Date(event.start_at);
    const eventEnd = new Date(event.end_at);

    // Check if the event falls within any of the visible dates
    return dates.some((date) => {
      const isAllDay =
        eventStart.getHours() === 0 && eventEnd.getHours() === 23;

      if (isAllDay) {
        // For all-day events, check if the date falls within the event's range
        return eventStart <= date && eventEnd >= date;
      }

      // For regular events, check if the event starts on this date
      return (
        date.getFullYear() === eventStart.getFullYear() &&
        date.getMonth() === eventStart.getMonth() &&
        date.getDate() === eventStart.getDate()
      );
    });
  });

  const columns = dates.length;

  return (
    <div
      className={`pointer-events-none absolute inset-0 grid ${
        columns === 1 && 'max-w-lg'
      }`}
      style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
    >
      <div id="calendar-event-matrix" className="relative col-span-full">
        {visibleEvents.map((event) => (
          <EventCard wsId={wsId} key={event.id} event={event} dates={dates} />
        ))}
      </div>
    </div>
  );
};

export default CalendarEventMatrix;
