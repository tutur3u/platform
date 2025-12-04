'use client';

import { Calendar, Clock, MapPin } from '@tuturuuu/icons';
import type { Workspace } from '@tuturuuu/types';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { useCalendar } from '@tuturuuu/ui/hooks/use-calendar';
import { useCalendarPreferences } from '@tuturuuu/ui/hooks/use-calendar-preferences';
import { isAllDayEvent } from '@tuturuuu/utils/calendar-utils';
import { cn } from '@tuturuuu/utils/format';
import { sanitizeHtml } from '@tuturuuu/utils/html-sanitizer';
import { getTimeFormatPattern } from '@tuturuuu/utils/time-helper';
import {
  addDays,
  format,
  isToday,
  isTomorrow,
  isYesterday,
  startOfDay,
} from 'date-fns';
import { useMemo } from 'react';

interface AgendaViewProps {
  startDate: Date;
  workspace?: Workspace;
  daysToShow?: number;
}

interface GroupedEvents {
  date: Date;
  events: CalendarEvent[];
}

const getRelativeDateLabel = (date: Date): string | null => {
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  if (isYesterday(date)) return 'Yesterday';
  return null;
};

const getEventStyles = (
  event: any
): { bg: string; text: string; border: string } => {
  const normalizeColor = (color: string): string => {
    if (!color) return 'blue';
    const normalized = color.trim().toLowerCase();
    if (normalized === '#6b7280' || normalized === 'grey') return 'gray';
    return normalized;
  };

  const colorMap: Record<string, { bg: string; text: string; border: string }> =
    {
      blue: {
        bg: 'bg-dynamic-blue/10',
        text: 'text-dynamic-blue',
        border: 'border-dynamic-blue/30',
      },
      red: {
        bg: 'bg-dynamic-red/10',
        text: 'text-dynamic-red',
        border: 'border-dynamic-red/30',
      },
      green: {
        bg: 'bg-dynamic-green/10',
        text: 'text-dynamic-green',
        border: 'border-dynamic-green/30',
      },
      purple: {
        bg: 'bg-dynamic-purple/10',
        text: 'text-dynamic-purple',
        border: 'border-dynamic-purple/30',
      },
      yellow: {
        bg: 'bg-dynamic-yellow/10',
        text: 'text-dynamic-yellow',
        border: 'border-dynamic-yellow/30',
      },
      orange: {
        bg: 'bg-dynamic-orange/10',
        text: 'text-dynamic-orange',
        border: 'border-dynamic-orange/30',
      },
      pink: {
        bg: 'bg-dynamic-pink/10',
        text: 'text-dynamic-pink',
        border: 'border-dynamic-pink/30',
      },
      cyan: {
        bg: 'bg-dynamic-cyan/10',
        text: 'text-dynamic-cyan',
        border: 'border-dynamic-cyan/30',
      },
      indigo: {
        bg: 'bg-dynamic-indigo/10',
        text: 'text-dynamic-indigo',
        border: 'border-dynamic-indigo/30',
      },
      gray: {
        bg: 'bg-dynamic-gray/10',
        text: 'text-dynamic-gray',
        border: 'border-dynamic-gray/30',
      },
    };

  const normalizedColor = normalizeColor(event.color || 'blue');
  return (colorMap[normalizedColor] || colorMap.blue) as {
    bg: string;
    text: string;
    border: string;
  };
};

export const AgendaView = ({ startDate, daysToShow = 30 }: AgendaViewProps) => {
  const { getCurrentEvents, openModal } = useCalendar();
  const { timeFormat } = useCalendarPreferences();
  const timePattern = getTimeFormatPattern(timeFormat);

  // Group events by date
  const groupedEvents = useMemo(() => {
    const groups: GroupedEvents[] = [];

    for (let i = 0; i < daysToShow; i++) {
      const currentDate = addDays(startOfDay(startDate), i);
      const events = getCurrentEvents(currentDate);

      // Only include days that have events
      if (events.length > 0) {
        // Sort events: all-day first, then by start time
        const sortedEvents = [...events].sort((a, b) => {
          const aIsAllDay = isAllDayEvent(a);
          const bIsAllDay = isAllDayEvent(b);

          if (aIsAllDay && !bIsAllDay) return -1;
          if (!aIsAllDay && bIsAllDay) return 1;

          const aStart = new Date(a.start_at).getTime();
          const bStart = new Date(b.start_at).getTime();
          return aStart - bStart;
        });

        groups.push({
          date: currentDate,
          events: sortedEvents,
        });
      }
    }

    return groups;
  }, [startDate, daysToShow, getCurrentEvents]);

  const formatEventTime = (event: CalendarEvent): string => {
    if (isAllDayEvent(event)) {
      return 'All day';
    }

    try {
      const start = new Date(event.start_at);
      const end = new Date(event.end_at);
      return `${format(start, timePattern)} - ${format(end, timePattern)}`;
    } catch {
      return '';
    }
  };

  if (groupedEvents.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <Calendar className="mb-4 h-16 w-16 text-muted-foreground/50" />
        <h3 className="mb-2 font-semibold text-lg">No events scheduled</h3>
        <p className="text-muted-foreground text-sm">
          You don't have any events in the next {daysToShow} days
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4">
      <div className="mx-auto max-w-4xl space-y-8">
        {groupedEvents.map(({ date, events }) => {
          const relativeLabel = getRelativeDateLabel(date);
          const isTodayDate = isToday(date);

          return (
            <div key={date.toISOString()} className="space-y-3">
              {/* Date header */}
              <div className="sticky top-0 z-10 rounded-lg border bg-background/50 p-4 backdrop-blur-md">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            'font-bold text-2xl leading-tight',
                            isTodayDate && 'text-primary'
                          )}
                        >
                          {format(date, 'EEEE')}
                        </div>
                        {relativeLabel && (
                          <span
                            className={cn(
                              'rounded-full px-2.5 py-1 font-semibold text-xs',
                              isTodayDate
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-muted-foreground'
                            )}
                          >
                            {relativeLabel}
                          </span>
                        )}
                      </div>
                      <span
                        className={cn(
                          'font-medium text-muted-foreground text-sm',
                          isTodayDate && 'text-primary/70'
                        )}
                      >
                        {format(date, 'MMMM d, yyyy')}
                      </span>
                    </div>
                  </div>
                </div>
                <div
                  className={cn(
                    'mt-2 border-b-2',
                    isTodayDate && 'border-primary'
                  )}
                />
              </div>

              {/* Events list */}
              <div className="space-y-2">
                {events.map((event) => {
                  const { bg, text, border } = getEventStyles(event);
                  const eventIsAllDay = isAllDayEvent(event);

                  return (
                    <div
                      key={event.id}
                      className={cn(
                        'group flex cursor-pointer gap-4 rounded-lg border p-4 transition-all duration-200 hover:scale-[1.01] hover:shadow-lg',
                        bg,
                        border
                      )}
                      onClick={() => openModal(event.id)}
                    >
                      {/* Time indicator */}
                      <div className="flex w-24 shrink-0 flex-col items-end pt-0.5">
                        {eventIsAllDay ? (
                          <div className={cn('font-medium text-xs', text)}>
                            All day
                          </div>
                        ) : (
                          <>
                            <div className={cn('font-semibold text-sm', text)}>
                              {format(new Date(event.start_at), timePattern)}
                            </div>
                            <div className="text-muted-foreground text-xs">
                              {format(new Date(event.end_at), timePattern)}
                            </div>
                          </>
                        )}
                      </div>

                      {/* Colored bar */}
                      <div
                        className={cn(
                          'w-1 shrink-0 rounded-full transition-all duration-200 group-hover:w-1.5',
                          text
                        )}
                      />

                      {/* Event details */}
                      <div className="min-w-0 flex-1 space-y-1">
                        <h4 className="font-semibold text-base leading-tight">
                          {event.title || 'Untitled event'}
                        </h4>

                        {event.description && (
                          <div
                            className="line-clamp-2 text-muted-foreground text-sm [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-primary/80"
                            // biome-ignore lint/security/noDangerouslySetInnerHtml: <safe because it's sanitized before saving to DB>
                            dangerouslySetInnerHTML={{
                              __html: event.description
                                ? sanitizeHtml(event.description)
                                : '',
                            }}
                          />
                        )}

                        {/* Metadata */}
                        <div className="flex flex-wrap items-center gap-3 pt-1">
                          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                            <Clock className="h-3.5 w-3.5" />
                            <span>{formatEventTime(event)}</span>
                          </div>

                          {event.location && (
                            <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                              <MapPin className="h-3.5 w-3.5" />
                              <span className="truncate">{event.location}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
