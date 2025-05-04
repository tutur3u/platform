import { useCalendar } from '../../../../hooks/use-calendar';
import { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { getEventStyles } from '@tuturuuu/utils/color-helper';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import timezone from 'dayjs/plugin/timezone';
import { Calendar } from 'lucide-react';

dayjs.extend(isBetween);
dayjs.extend(timezone);

const AllDayEventBar = ({ dates }: { dates: Date[] }) => {
  const { allDayEvents, settings, openModal } = useCalendar();
  const showWeekends = settings.appearance.showWeekends;
  const tz = settings?.timezone?.timezone;

  // Filter out weekend days if showWeekends is false
  const visibleDates = showWeekends
    ? dates
    : dates.filter((date) => {
        const day = tz === 'auto' ? dayjs(date).day() : dayjs(date).tz(tz).day();
        return day !== 0 && day !== 6; // 0 = Sunday, 6 = Saturday
      });

  // Function to get events for a specific date
  const getEventsForDate = (date: Date): CalendarEvent[] => {
    const dateStr = tz === 'auto' ? dayjs(date).format('YYYY-MM-DD') : dayjs(date).tz(tz).format('YYYY-MM-DD');

    return allDayEvents
      .filter((event) => {
        const eventStart = tz === 'auto' ? dayjs(event.start_at) : dayjs(event.start_at).tz(tz);
        const eventEnd = tz === 'auto' ? dayjs(event.end_at) : dayjs(event.end_at).tz(tz);
        // Check if the date falls within the event's date range
        return dayjs(dateStr).isBetween(
          eventStart.startOf('day'),
          eventEnd.endOf('day'),
          'day',
          '[]'
        );
      })
      .map((event) => {
        const eventStart = tz === 'auto' ? dayjs(event.start_at) : dayjs(event.start_at).tz(tz);
        const eventEnd = tz === 'auto' ? dayjs(event.end_at) : dayjs(event.end_at).tz(tz);
        return {
          ...event,
          days: eventEnd.diff(eventStart, 'day'),
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
      <div className="bg-muted/30 flex w-16 items-center justify-center border-b border-l p-2 font-medium">
        <Calendar className="text-muted-foreground h-4 w-4" />
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
              key={`all-day-${tz === 'auto' ? dayjs(date).toISOString() : dayjs(date).tz(tz).toISOString()}`}
              className="hover:bg-muted/20 group mr-[1px] flex h-full flex-col justify-start gap-1 overflow-y-auto p-1 transition-colors last:mr-0 last:border-r"
            >
              {dateEvents.map((event) => {
                const { bg, border, text } = getEventStyles(
                  event.color || 'BLUE'
                );

                return (
                  <div
                    key={`all-day-event-${event.id}-${tz === 'auto' ? dayjs(date).toISOString() : dayjs(date).tz(tz).toISOString()}`}
                    className={cn(
                      'cursor-pointer truncate rounded-sm border-l-2 px-2 py-1 text-xs font-semibold',
                      bg,
                      border,
                      text
                    )}
                    onClick={() => openModal(event.id, 'all-day')}
                  >
                    {typeof event.google_event_id === 'string' &&
                      event.google_event_id.trim() !== '' && (
                        <img
                          src="/media/google-calendar-icon.png"
                          alt="Google Calendar"
                          className="mr-1 inline-block h-[1.25em] w-[1.25em] align-middle opacity-80 dark:opacity-90"
                          title="Synced from Google Calendar"
                          data-testid="google-calendar-logo"
                        />
                      )}
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
