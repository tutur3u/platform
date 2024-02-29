import { useParams } from 'next/navigation';
import { useCalendar } from '@/hooks/useCalendar';
import EventCard from './EventCard';

const CalendarEventMatrix = () => {
  const params = useParams();
  const wsId = params?.wsId as string;

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
          <EventCard wsId={wsId} key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
};

export default CalendarEventMatrix;
