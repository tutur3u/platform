import { CalendarEvent } from '../../types/primitives/CalendarEvent';
import EventCard from './EventCard';

interface CalendarEventColumnProps {
  events: CalendarEvent[];
  getEventLevel: (eventId: string) => number;
  onUpdated: (id: string, data: Partial<CalendarEvent>) => void;
}

const CalendarEventColumn = ({
  events,
  getEventLevel,
  onUpdated,
}: CalendarEventColumnProps) => {
  return (
    <div className="relative">
      {events.map((event) => (
        <EventCard
          key={event.id}
          event={event}
          getLevel={getEventLevel}
          onUpdated={onUpdated}
        />
      ))}
    </div>
  );
};

export default CalendarEventColumn;
