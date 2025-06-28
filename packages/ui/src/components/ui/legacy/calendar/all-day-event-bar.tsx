import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { useCalendarSync } from '@tuturuuu/ui/hooks/use-calendar-sync';
import { getEventStyles } from '@tuturuuu/utils/color-helper';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import timezone from 'dayjs/plugin/timezone';
import { Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useCalendar } from '../../../../hooks/use-calendar';
import { MIN_COLUMN_WIDTH } from './config';

dayjs.extend(isBetween);
dayjs.extend(timezone);

const MAX_EVENTS_DISPLAY = 2;

// Define types for better type safety
interface EventSpan {
  event: CalendarEvent;
  startIndex: number;
  endIndex: number;
  span: number;
}

interface EventLayout {
  spans: EventSpan[];
  maxVisibleEventsPerDay: number;
  eventsByDay: EventSpan[][];
}

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

  // Process events to determine their spans across visible dates
  const eventLayout = useMemo((): EventLayout => {
    const spans: EventSpan[] = [];
    const eventsByDay: EventSpan[][] = Array(visibleDates.length)
      .fill(null)
      .map(() => []);

    // Process each all-day event
    allDayEvents.forEach((event) => {
      const eventStart =
        tz === 'auto' ? dayjs(event.start_at) : dayjs(event.start_at).tz(tz);
      const eventEnd =
        tz === 'auto' ? dayjs(event.end_at) : dayjs(event.end_at).tz(tz);

      // Find the start and end indices within our visible dates
      let startIndex = -1;
      let endIndex = -1;

      // First pass: find any overlap with visible dates
      const firstVisibleDate =
        tz === 'auto' ? dayjs(visibleDates[0]) : dayjs(visibleDates[0]).tz(tz);
      const lastVisibleDate =
        tz === 'auto'
          ? dayjs(visibleDates[visibleDates.length - 1])
          : dayjs(visibleDates[visibleDates.length - 1]).tz(tz);

      // Check if event overlaps with our visible date range at all
      // Event overlaps if: event_start < visible_end AND event_end > visible_start
      const eventOverlaps =
        eventStart.isBefore(lastVisibleDate.add(1, 'day'), 'day') &&
        eventEnd.isAfter(firstVisibleDate, 'day');

      // Debug logging for multi-week events
      const eventDurationDays = eventEnd.diff(eventStart, 'day');
      if (eventDurationDays > 7) {
        console.log('Multi-week event detected:', {
          title: event.title,
          eventStart: eventStart.format('YYYY-MM-DD'),
          eventEnd: eventEnd.format('YYYY-MM-DD'),
          durationDays: eventDurationDays,
          firstVisibleDate: firstVisibleDate.format('YYYY-MM-DD'),
          lastVisibleDate: lastVisibleDate.format('YYYY-MM-DD'),
          eventOverlaps,
        });
      }

      if (!eventOverlaps) {
        return; // Skip this event if it doesn't overlap with visible dates
      }

      // Find exact start and end indices
      visibleDates.forEach((date, index) => {
        const currentDate = tz === 'auto' ? dayjs(date) : dayjs(date).tz(tz);

        // Start index: first visible date that the event overlaps with
        if (
          startIndex === -1 &&
          (currentDate.isSame(eventStart, 'day') ||
            currentDate.isAfter(eventStart, 'day')) &&
          currentDate.isBefore(eventEnd, 'day')
        ) {
          startIndex = index;
        }

        // End index: last visible date that the event overlaps with
        if (
          currentDate.isBefore(eventEnd, 'day') &&
          (currentDate.isSame(eventStart, 'day') ||
            currentDate.isAfter(eventStart, 'day'))
        ) {
          endIndex = index;
        }
      });

      // Handle edge cases where event starts before or ends after visible range
      if (
        startIndex === -1 &&
        eventStart.isBefore(firstVisibleDate, 'day') &&
        eventEnd.isAfter(firstVisibleDate, 'day')
      ) {
        startIndex = 0;
      }
      if (
        endIndex === -1 &&
        eventEnd.isAfter(lastVisibleDate, 'day') &&
        eventStart.isBefore(lastVisibleDate.add(1, 'day'), 'day')
      ) {
        endIndex = visibleDates.length - 1;
      }

      // Include events that have at least one day visible in our date range
      if (startIndex !== -1 && endIndex !== -1) {
        const span = endIndex - startIndex + 1;
        const eventSpan: EventSpan = {
          event,
          startIndex,
          endIndex,
          span,
        };

        spans.push(eventSpan);

        // Add this event to each day it spans
        for (let i = startIndex; i <= endIndex; i++) {
          eventsByDay[i]?.push(eventSpan);
        }
      }
    });

    // Calculate max visible events per day for layout purposes
    let maxVisibleEventsPerDay = 0;
    eventsByDay.forEach((dayEvents, dayIndex) => {
      const dateKey =
        tz === 'auto'
          ? dayjs(visibleDates[dayIndex]).format('YYYY-MM-DD')
          : dayjs(visibleDates[dayIndex]).tz(tz).format('YYYY-MM-DD');

      const shouldShowAll = dayEvents.length === MAX_EVENTS_DISPLAY + 1;
      const isExpanded = expandedDates.includes(dateKey) || shouldShowAll;
      const visibleCount = isExpanded
        ? dayEvents.length
        : Math.min(dayEvents.length, MAX_EVENTS_DISPLAY);

      maxVisibleEventsPerDay = Math.max(maxVisibleEventsPerDay, visibleCount);
    });

    return { spans, maxVisibleEventsPerDay, eventsByDay };
  }, [allDayEvents, visibleDates, tz, expandedDates]);

  // Get unique events for a specific date (for expansion logic)
  const getUniqueEventsForDate = (dateIndex: number): EventSpan[] => {
    return eventLayout.eventsByDay[dateIndex] ?? [];
  };

  // Check if we have any all-day events to display
  if (eventLayout.spans.length === 0) {
    return null;
  }

  const toggleDateExpansion = (dateKey: string) => {
    setExpandedDates((prev) =>
      prev.includes(dateKey)
        ? prev.filter((d) => d !== dateKey)
        : [...prev, dateKey]
    );
  };

  // Calculate dynamic height based on visible events
  const barHeight = Math.max(1.9, eventLayout.maxVisibleEventsPerDay * 1.75);

  return (
    <div className="flex">
      {/* Label column */}
      <div className="flex w-16 items-center justify-center border-b border-l bg-muted/30 p-2 font-medium">
        <Calendar className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* All-day event columns with relative positioning for spanning events */}
      <div
        className={cn('relative flex-1 border-b')}
        style={{
          minWidth: `${visibleDates.length * MIN_COLUMN_WIDTH}px`,
          height: `${barHeight}rem`,
        }}
      >
        {/* Grid background for date columns - this maintains proper borders */}
        <div
          className={cn('grid h-full')}
          style={{
            gridTemplateColumns: `repeat(${visibleDates.length}, minmax(0, 1fr))`,
          }}
        >
          {visibleDates.map((date, dateIndex) => {
            const dateKey =
              tz === 'auto'
                ? dayjs(date).format('YYYY-MM-DD')
                : dayjs(date).tz(tz).format('YYYY-MM-DD');

            const dateEvents = getUniqueEventsForDate(dateIndex);
            const shouldShowAll = dateEvents.length === MAX_EVENTS_DISPLAY + 1;
            const isExpanded = expandedDates.includes(dateKey) || shouldShowAll;
            const hiddenCount =
              !isExpanded && !shouldShowAll
                ? Math.max(0, dateEvents.length - MAX_EVENTS_DISPLAY)
                : 0;

            return (
              <div
                key={`all-day-column-${dateKey}`}
                className="group flex h-full flex-col justify-start border-l last:border-r hover:bg-muted/20"
              >
                {/* Show/hide expansion button */}
                {hiddenCount > 0 && (
                  <div
                    className="flex cursor-pointer items-center justify-center rounded-sm px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40"
                    onClick={() => toggleDateExpansion(dateKey)}
                    style={{
                      position: 'absolute',
                      top: `${MAX_EVENTS_DISPLAY * 1.7}rem`,
                      left: `${(dateIndex * 100) / visibleDates.length}%`,
                      width: `${100 / visibleDates.length}%`,
                      zIndex: 10,
                    }}
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
                      style={{
                        position: 'absolute',
                        top: `${dateEvents.length * 1.7}rem`,
                        left: `${(dateIndex * 100) / visibleDates.length}%`,
                        width: `${100 / visibleDates.length}%`,
                        zIndex: 10,
                      }}
                    >
                      <ChevronUp className="mr-1 h-3 w-3" />
                      Show less
                    </div>
                  )}
              </div>
            );
          })}
        </div>

        {/* Absolute positioned spanning events */}
        {eventLayout.spans.map((eventSpan) => {
          const { event, startIndex, span } = eventSpan;
          const { bg, border, text } = getEventStyles(event.color || 'BLUE');

          // Calculate which row this event should be in for each day it spans
          let eventRow = 0;
          for (
            let dayIndex = startIndex;
            dayIndex < startIndex + span;
            dayIndex++
          ) {
            const dayEvents = eventLayout.eventsByDay[dayIndex];
            const eventRowInDay =
              dayEvents?.findIndex((e) => e.event.id === event.id) ?? -1;
            eventRow = Math.max(eventRow, eventRowInDay);
          }

          // Check if this event should be visible based on expansion state
          const shouldHideEvent = visibleDates.some((date, dateIndex) => {
            if (dateIndex < startIndex || dateIndex > startIndex + span - 1)
              return false;

            const dateKey =
              tz === 'auto'
                ? dayjs(date).format('YYYY-MM-DD')
                : dayjs(date).tz(tz).format('YYYY-MM-DD');

            const dateEvents = getUniqueEventsForDate(dateIndex);
            const shouldShowAll = dateEvents.length === MAX_EVENTS_DISPLAY + 1;
            const isExpanded = expandedDates.includes(dateKey) || shouldShowAll;
            const visibleCount = isExpanded
              ? dateEvents.length
              : Math.min(dateEvents.length, MAX_EVENTS_DISPLAY);

            return eventRow >= visibleCount;
          });

          if (shouldHideEvent) return null;

          return (
            <div
              key={`spanning-event-${event.id}`}
              className={cn(
                'absolute cursor-pointer truncate rounded-sm border-l-2 px-2 py-1 text-xs font-semibold',
                bg,
                border,
                text
              )}
              style={{
                left: `${(startIndex * 100) / visibleDates.length}%`,
                width: `calc(${(span * 100) / visibleDates.length}% - 0.75rem)`,
                top: `${eventRow * 1.6 + 0.25}rem`,
                height: '1.35rem',
                zIndex: 5,
              }}
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
    </div>
  );
};
