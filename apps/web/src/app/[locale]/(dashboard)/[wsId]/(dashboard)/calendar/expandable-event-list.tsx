'use client';

import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  MapPin,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { useCalendarPreferences } from '@tuturuuu/ui/hooks/use-calendar-preferences';
import { cn } from '@tuturuuu/utils/format';
import { getTimeFormatPattern } from '@tuturuuu/utils/time-helper';
import { format, isToday, isTomorrow } from 'date-fns';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import EventDescription from './event-description';

interface CalendarEvent {
  id: string;
  title: string | null;
  description: string | null;
  start_at: string;
  end_at: string | null;
  location: string | null;
}

interface ExpandableEventListProps {
  events: CalendarEvent[];
  initialLimit?: number;
}

export default function ExpandableEventList({
  events,
  initialLimit = 6,
}: ExpandableEventListProps) {
  const t = useTranslations('dashboard');
  const [showAll, setShowAll] = useState(false);
  const { timeFormat } = useCalendarPreferences();
  const timePattern = getTimeFormatPattern(timeFormat);

  const displayedEvents = showAll ? events : events.slice(0, initialLimit);
  const hasMoreEvents = events.length > initialLimit;

  const formatEventTime = (startAt: string, endAt: string | null) => {
    const start = new Date(startAt);
    const startTime = format(start, timePattern);
    if (!endAt) return startTime;
    const end = new Date(endAt);
    const endTime = format(end, timePattern);
    return `${startTime} - ${endTime}`;
  };

  const getDateLabel = (date: Date) => {
    if (isToday(date)) return t('today');
    if (isTomorrow(date)) return t('tomorrow');
    return format(date, 'EEE, MMM d');
  };

  const getTimeUntil = (startAt: string) => {
    const now = new Date();
    const start = new Date(startAt);
    const diffMs = start.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 60) {
      return t('in_minutes', { count: diffMins });
    }
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) {
      return t('in_hours', { count: diffHours });
    }
    const diffDays = Math.floor(diffHours / 24);
    return t('in_days', { count: diffDays });
  };

  return (
    <div className="space-y-2">
      {displayedEvents.map((event, index) => {
        const startDate = new Date(event.start_at);
        const isFirst = index === 0;

        return (
          <div
            key={event.id}
            className={cn(
              'group relative overflow-hidden rounded-xl border p-3 transition-all duration-200 hover:shadow-md',
              isFirst
                ? 'border-dynamic-cyan/40 bg-linear-to-r from-dynamic-cyan/10 via-dynamic-cyan/5 to-transparent'
                : 'border-border/50 hover:border-dynamic-cyan/30 hover:bg-dynamic-cyan/5'
            )}
          >
            {/* Left accent for first event */}
            {isFirst && (
              <div className="absolute top-0 bottom-0 left-0 w-1.5 bg-dynamic-cyan" />
            )}

            <div className={cn('space-y-2', isFirst && 'pl-2')}>
              {/* Title row */}
              <div className="flex items-start justify-between gap-2">
                <h4 className="line-clamp-1 font-semibold text-sm transition-colors">
                  {event.title || t('untitled_event')}
                </h4>
                <Badge
                  className={cn(
                    'shrink-0 font-medium text-[10px]',
                    isFirst
                      ? 'bg-dynamic-cyan/15 text-dynamic-cyan ring-1 ring-dynamic-cyan/30'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {getTimeUntil(event.start_at)}
                </Badge>
              </div>

              {/* Time and date */}
              <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                <span
                  className={cn(
                    'flex items-center gap-1 rounded-md px-2 py-0.5 font-medium',
                    isFirst
                      ? 'bg-dynamic-cyan/15 text-dynamic-cyan'
                      : 'bg-muted'
                  )}
                >
                  <Calendar className="h-3 w-3" />
                  {getDateLabel(startDate)}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatEventTime(event.start_at, event.end_at)}
                </span>
              </div>

              {/* Description */}
              {event.description && (
                <EventDescription
                  description={event.description}
                  className="line-clamp-1 text-muted-foreground text-xs"
                />
              )}

              {/* Location */}
              {event.location && (
                <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                  <MapPin className="h-3 w-3 shrink-0 text-dynamic-pink" />
                  <span className="line-clamp-1">{event.location}</span>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Show more/less button */}
      {hasMoreEvents && (
        <div className="flex justify-center pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAll(!showAll)}
            className="gap-2 text-muted-foreground hover:bg-dynamic-cyan/10 hover:text-dynamic-cyan"
          >
            {showAll ? (
              <>
                <ChevronUp className="h-4 w-4" />
                {t('show_less')}
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" />
                {t('show_more_events', { count: events.length - initialLimit })}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
