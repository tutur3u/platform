import { useCalendar } from '../../hooks/useCalendar';
import EventCard from './EventCard';

const CalendarEventMatrix = () => {
  const { getEvents, getDatesInView } = useCalendar();

  const dates = getDatesInView();
  const events = getEvents();
  const columns = dates.length;

  return (
    <div
      className={`pointer-events-none absolute inset-0 grid ${
        columns === 1 && 'max-w-lg'
      }`}
    >
      <div id="calendar-event-matrix" className="relative">
        {events.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
};

export default CalendarEventMatrix;
