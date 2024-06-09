import EventCard from './EventCard';
import { useCalendar } from '@/hooks/useCalendar';
import { useParams } from 'next/navigation';

const CalendarEventMatrix = ({ dates }: { dates: Date[] }) => {
  const params = useParams();
  const wsId = params?.wsId as string;

  const { getEvents } = useCalendar();

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
          <EventCard wsId={wsId} key={event.id} event={event} dates={dates} />
        ))}
      </div>
    </div>
  );
};

export default CalendarEventMatrix;
