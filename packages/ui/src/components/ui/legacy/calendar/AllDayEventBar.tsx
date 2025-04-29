import { useCalendar } from '../../../../hooks/use-calendar';
import { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { getEventStyles } from '@tuturuuu/utils/color-helper';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import { Calendar } from 'lucide-react';

dayjs.extend(isBetween);

const AllDayEventBar = ({ dates }: { dates: Date[] }) => {
  const { allDayEvents, settings, openModal } = useCalendar();
  const showWeekends = settings.appearance.showWeekends;

  // Filter out weekend days if showWeekends is false
  const visibleDates = showWeekends
    ? dates
    : dates.filter((date) => {
        const day = date.getDay();
        return day !== 0 && day !== 6; // 0 = Sunday, 6 = Saturday
      });

  // Function to get events for a specific date
  const getEventsForDate = (date: Date): CalendarEvent[] => {
    const dateStr = date.toDateString();

    return allDayEvents
      .filter((event) => {
        const eventStart = new Date(event.start_at);
        const eventEnd = new Date(event.end_at);

        // Check if the date falls within the event's date range
        return dayjs(dateStr).isBetween(
          dayjs(eventStart),
          dayjs(eventEnd),
          'day',
          '[)'
        );
      })
      .map((event) => {
        return {
          ...event,
          days: dayjs(event.end_at).diff(dayjs(event.start_at), 'day'),
        };
      });
  };

  if (
    visibleDates.reduce(
      (acc, date) => acc + getEventsForDate(date).length,
      0
    ) === 0
  ) {
    return null;
  }

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

          // return JSON.stringify(dateEvents);

          return (
            <div
              key={`all-day-${date.toISOString()}`}
              className="group mr-[1px] flex h-full flex-col justify-start gap-1 overflow-y-auto p-1 transition-colors last:mr-0 last:border-r hover:bg-muted/20"
            >
              {dateEvents.map((event) => {
                const { bg, border, text } = getEventStyles(
                  event.color || 'BLUE'
                );

                return (
                  <div
                    key={`all-day-event-${event.id}-${date.toISOString()}`}
                    className={cn(
                      'cursor-pointer truncate rounded-sm border-l-2 px-2 py-1 text-xs font-semibold',
                      bg,
                      border,
                      text
                    )}
                    onClick={() => openModal(event.id, 'all-day')}
                  >
                    {event.title}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AllDayEventBar;
