import { useCalendar } from '../../../../hooks/use-calendar';
import { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { cn } from '@tuturuuu/utils/format';
import { Calendar } from 'lucide-react';

const AllDayEventBar = ({ dates }: { dates: Date[] }) => {
  const { getEvents, settings, openModal } = useCalendar();
  const showWeekends = settings.appearance.showWeekends;

  // Filter out weekend days if showWeekends is false
  const visibleDates = showWeekends
    ? dates
    : dates.filter((date) => {
        const day = date.getDay();
        return day !== 0 && day !== 6; // 0 = Sunday, 6 = Saturday
      });

  // Get all events and filter for all-day events
  const events = getEvents();

  const allDayEvents = events.filter((event: CalendarEvent) => {
    const start = new Date(event.start_at);
    const end = new Date(event.end_at);
    const duration = end.getTime() - start.getTime();

    // Check if duration is exactly 24 hours (86400000 milliseconds) or
    // if start and end times are at midnight (indicating a full day)
    return duration % 86400000 === 0;
  });

  // Function to get events for a specific date
  const getEventsForDate = (date: Date): CalendarEvent[] => {
    const dateStr = date.toDateString();

    return allDayEvents.filter((event) => {
      const eventStart = new Date(event.start_at);
      const eventEnd = new Date(event.end_at);

      // Check if the date falls within the event's date range
      return (
        eventStart.toDateString() <= dateStr &&
        eventEnd.toDateString() >= dateStr
      );
    });
  };

  // Function to get background color class based on event color
  const getEventColorClass = (color: string | undefined): string => {
    const validColor = color?.toLowerCase() || 'blue';
    return `bg-${validColor}-600 hover:bg-${validColor}-700`;
  };

  return (
    <div className="flex">
      {/* Label column */}
      <div className="flex w-16 items-center justify-center border-b border-l bg-muted/30 p-2 font-medium">
        <Calendar className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* All-day event columns */}
      <div
        className={cn('grid flex-1 border-b border-l')}
        style={{
          gridTemplateColumns: `repeat(${visibleDates.length}, minmax(0, 1fr))`,
          minWidth: `${visibleDates.length * 120}px`, // Match column width
        }}
      >
        {visibleDates.map((date) => {
          const dateEvents = getEventsForDate(date);

          return (
            <div
              key={`all-day-${date.toISOString()}`}
              className="group mr-[1px] flex h-full flex-col justify-center gap-1 overflow-y-auto p-1 transition-colors last:mr-0 last:border-r hover:bg-muted/20"
            >
              {dateEvents.map((event) => (
                <div
                  key={`all-day-event-${event.id}-${date.toISOString()}`}
                  className={cn(
                    'cursor-pointer truncate rounded-sm px-2 py-1 text-xs text-white',
                    getEventColorClass(event.color)
                  )}
                  onClick={() => openModal(event.id)}
                >
                  {event.title}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AllDayEventBar;
