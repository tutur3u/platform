import { CalendarEvent } from '../../types/primitives/CalendarEvent';
import EventCard from './EventCard';

interface CalendarEventColumnProps {
  events: CalendarEvent[];
  getTaskLevel: (task: CalendarEvent) => number;
  onUpdated: (task: CalendarEvent) => void;
}

const CalendarEventColumn = ({
  events,
  getTaskLevel,
  onUpdated,
}: CalendarEventColumnProps) => {
  return (
    <div className="relative">
      {events.map((event) => (
        <EventCard
          key={event.id}
          event={event}
          getLevel={getTaskLevel}
          onUpdated={onUpdated}
        />
      ))}
    </div>
  );
};

export default CalendarEventColumn;
