import { useCalendar } from '../../hooks/useCalendar';
import EventCard from './EventCard';

const CalendarEventMatrix = () => {
  const { getEvents, getDatesInView } = useCalendar();

  const dates = getDatesInView();
  const events = getEvents();
  const columns = dates.length;

  return (
    <div
      className={`pointer-events-none absolute inset-0 grid grid-cols-${columns} ${
        dates.length === 1 && 'max-w-lg'
      }`}
    >
      {events.map((event) => (
        <EventCard key={event.id} event={event} />
      ))}
    </div>
  );
};

export default CalendarEventMatrix;
