'use client';

import {
  Calendar,
  CalendarClock,
  Clock,
  ExternalLink,
  MapPin,
  Sparkles,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useTunaCalendar } from '../../hooks/use-calendar';
import type { TunaCalendarEvent } from '../../types/tuna';

interface CalendarPanelProps {
  wsId: string;
  className?: string;
}

function formatEventTime(startAt: string, endAt: string): string {
  const start = new Date(startAt);
  const end = new Date(endAt);

  const timeFormat: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  };

  const startTime = start.toLocaleTimeString(undefined, timeFormat);
  const endTime = end.toLocaleTimeString(undefined, timeFormat);

  return `${startTime} - ${endTime}`;
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const tomorrowEnd = new Date(todayEnd);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

  if (date >= todayStart && date <= todayEnd) {
    return 'Today';
  }
  if (date > todayEnd && date <= tomorrowEnd) {
    return 'Tomorrow';
  }

  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

interface EventItemProps {
  event: TunaCalendarEvent;
  wsId: string;
}

function EventItem({ event, wsId }: EventItemProps) {
  const isToday = formatRelativeDate(event.start_at) === 'Today';
  const eventColor = event.color || '#3b82f6'; // Default to blue

  return (
    <Link
      href={`/${wsId}/calendar`}
      className={cn(
        'group relative block rounded-lg border-l-4 bg-muted/30 p-3 transition-colors',
        'hover:bg-muted/50'
      )}
      style={{ borderLeftColor: eventColor }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-medium text-sm leading-tight">
            {event.title}
          </p>

          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {/* Date badge */}
            <Badge
              variant={isToday ? 'default' : 'outline'}
              className={cn(
                'font-normal text-xs',
                isToday && 'bg-dynamic-cyan text-white'
              )}
            >
              {formatRelativeDate(event.start_at)}
            </Badge>

            {/* Time */}
            <span className="flex items-center gap-1 text-muted-foreground text-xs">
              <Clock className="h-3 w-3" />
              {formatEventTime(event.start_at, event.end_at)}
            </span>
          </div>

          {/* Location */}
          {event.location && (
            <div className="mt-1.5 flex items-center gap-1 text-muted-foreground text-xs">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="line-clamp-1">{event.location}</span>
            </div>
          )}
        </div>

        {/* External link icon */}
        <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    </Link>
  );
}

export function CalendarPanel({ wsId, className }: CalendarPanelProps) {
  const { data: calendarData, isLoading } = useTunaCalendar({ wsId });

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('space-y-4', className)}>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-muted/50" />
        ))}
      </div>
    );
  }

  const events = calendarData?.events ?? [];
  const stats = calendarData?.stats ?? { total: 0, encrypted_count: 0 };

  const isEmpty = events.length === 0;

  // Group events by date
  const eventsByDate = events.reduce(
    (acc, event) => {
      const dateKey = formatRelativeDate(event.start_at);
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(event);
      return acc;
    },
    {} as Record<string, TunaCalendarEvent[]>
  );

  return (
    <div className={cn('space-y-6', className)}>
      {/* Stats card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-5 w-5 text-dynamic-cyan" />
            Upcoming Events
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="font-bold text-2xl text-dynamic-cyan">
                {stats.total}
              </div>
              <div className="text-muted-foreground text-xs">This Week</div>
            </div>
            <div className="text-center">
              <div
                className={cn(
                  'font-bold text-2xl',
                  stats.encrypted_count > 0
                    ? 'text-dynamic-orange'
                    : 'text-muted-foreground'
                )}
              >
                {stats.encrypted_count}
              </div>
              <div className="text-muted-foreground text-xs">Encrypted</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Empty state */}
      {isEmpty && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="relative mx-auto mb-4 w-fit">
            <div className="absolute inset-0 animate-pulse rounded-full bg-dynamic-cyan/20 blur-xl" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full border-4 border-dynamic-cyan/20 bg-linear-to-br from-dynamic-cyan/10 via-dynamic-cyan/5 to-transparent shadow-lg ring-4 ring-dynamic-cyan/10">
              <Sparkles className="h-8 w-8 text-dynamic-cyan/50" />
            </div>
          </div>
          <h3 className="font-semibold text-sm">No upcoming events</h3>
          <p className="mt-1 text-muted-foreground text-xs">
            Your calendar is clear for the next week
          </p>
          <Link href={`/${wsId}/calendar`} className="mt-4">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-dynamic-cyan/30 transition-all hover:border-dynamic-cyan hover:bg-dynamic-cyan/10 hover:text-dynamic-cyan"
            >
              <Calendar className="h-4 w-4" />
              View Calendar
            </Button>
          </Link>
        </div>
      )}

      {/* Events grouped by date */}
      {!isEmpty && (
        <div className="space-y-4">
          {Object.entries(eventsByDate).map(([dateLabel, dateEvents]) => (
            <div key={dateLabel} className="space-y-2">
              <h3 className="flex items-center gap-2 px-2 font-medium text-muted-foreground text-sm">
                <Calendar className="h-4 w-4" />
                {dateLabel}
                <Badge variant="secondary" className="ml-auto text-xs">
                  {dateEvents.length}
                </Badge>
              </h3>
              <div className="space-y-2">
                {dateEvents.map((event) => (
                  <EventItem key={event.id} event={event} wsId={wsId} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View all link */}
      {!isEmpty && (
        <div className="pt-2 text-center">
          <Link href={`/${wsId}/calendar`}>
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-muted-foreground hover:text-foreground"
            >
              View full calendar
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
