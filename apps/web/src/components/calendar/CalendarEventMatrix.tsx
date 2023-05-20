import { useRouter } from 'next/router';
import { useCalendar } from '../../hooks/useCalendar';
import EventCard from './EventCard';

const CalendarEventMatrix = () => {
  const router = useRouter();

  const { wsId } = router.query;
  const { getEvents, datesInView: dates } = useCalendar();

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
          <EventCard wsId={wsId as string} key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
};

export default CalendarEventMatrix;
