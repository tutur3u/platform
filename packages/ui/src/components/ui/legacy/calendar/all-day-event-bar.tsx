import { useCalendar } from '../../../../hooks/use-calendar';
import { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { useCalendarSync } from '@tuturuuu/ui/hooks/use-calendar-sync';
import { getEventStyles } from '@tuturuuu/utils/color-helper';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import timezone from 'dayjs/plugin/timezone';
import { Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

dayjs.extend(isBetween);
dayjs.extend(timezone);

const MAX_EVENTS_DISPLAY = 2;

export const AllDayEventBar = ({ dates }: { dates: Date[] }) => {
  const { settings, openModal } = useCalendar();
  const { allDayEvents } = useCalendarSync();
  const showWeekends = settings.appearance.showWeekends;
  const tz = settings?.timezone?.timezone;
  const [expandedDates, setExpandedDates] = useState<string[]>([]);

  // Filter out weekend days if showWeekends is false
  const visibleDates = showWeekends
    ? dates
    : dates.filter((date) => {
        const day =
          tz === 'auto' ? dayjs(date).day() : dayjs(date).tz(tz).day();
        return day !== 0 && day !== 6; // 0 = Sunday, 6 = Saturday
      });

  // Function to get events for a specific date
  const getEventsForDate = (date: Date): CalendarEvent[] => {
    const dateStr =
      tz === 'auto'
        ? dayjs(date).format('YYYY-MM-DD')
        : dayjs(date).tz(tz).format('YYYY-MM-DD');

    return allDayEvents
      .filter((event) => {
        const eventStart =
          tz === 'auto' ? dayjs(event.start_at) : dayjs(event.start_at).tz(tz);
        const eventEnd =
          tz === 'auto' ? dayjs(event.end_at) : dayjs(event.end_at).tz(tz);
        // Check if the date falls within the event's date range
        return dayjs(dateStr).isBetween(
          eventStart.startOf('day'),
          eventEnd.startOf('day'),
          'day',
          '[)'
        );
      })
      .map((event) => {
        const eventStart =
          tz === 'auto' ? dayjs(event.start_at) : dayjs(event.start_at).tz(tz);
        const eventEnd =
          tz === 'auto' ? dayjs(event.end_at) : dayjs(event.end_at).tz(tz);
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

  const toggleDateExpansion = (dateKey: string) => {
    setExpandedDates((prev) =>
      prev.includes(dateKey)
        ? prev.filter((d) => d !== dateKey)
        : [...prev, dateKey]
    );
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
          minWidth: `${visibleDates.length * 100}px`, // Match column width
        }}
      >
        {visibleDates.map((date) => {
          const dateKey =
            tz === 'auto'
              ? dayjs(date).format('YYYY-MM-DD')
              : dayjs(date).tz(tz).format('YYYY-MM-DD');
          const dateEvents = getEventsForDate(date);

          // If there are exactly MAX_EVENTS_DISPLAY + 1 events, show all of them
          const shouldShowAll = dateEvents.length === MAX_EVENTS_DISPLAY + 1;
          const isExpanded = expandedDates.includes(dateKey) || shouldShowAll;

          const visibleEvents = isExpanded
            ? dateEvents
            : dateEvents.slice(0, MAX_EVENTS_DISPLAY);

          // Only show "more" button if there are more than MAX_EVENTS_DISPLAY + 1 events and not expanded
          const hiddenCount =
            !isExpanded && !shouldShowAll
              ? dateEvents.length - MAX_EVENTS_DISPLAY
              : 0;

          return (
            <div
              key={`all-day-${dateKey}`}
              className="group mr-1 -ml-1 flex h-full flex-col justify-start gap-1 overflow-y-auto p-1 transition-colors last:mr-0 last:border-r hover:bg-muted/20"
            >
              {visibleEvents.map((event) => {
                const { bg, border, text } = getEventStyles(
                  event.color || 'BLUE'
                );

                return (
                  <div
                    key={`all-day-event-${event.id}-${dateKey}`}
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

              {hiddenCount > 0 && (
                <div
                  className="flex cursor-pointer items-center justify-center rounded-sm px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40"
                  onClick={() => toggleDateExpansion(dateKey)}
                >
                  <ChevronDown className="mr-1 h-3 w-3" />
                  {hiddenCount} more
                </div>
              )}

              {isExpanded &&
                !shouldShowAll &&
                dateEvents.length > MAX_EVENTS_DISPLAY && (
                  <div
                    className="flex cursor-pointer items-center justify-center rounded-sm px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40"
                    onClick={() => toggleDateExpansion(dateKey)}
                  >
                    <ChevronUp className="mr-1 h-3 w-3" />
                    Show less
                  </div>
                )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
