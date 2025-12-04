'use client';

import { Clock, Plus } from '@tuturuuu/icons';
import type { Workspace } from '@tuturuuu/types';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { Button } from '@tuturuuu/ui/button';
import { useCalendar } from '@tuturuuu/ui/hooks/use-calendar';
import { useCalendarPreferences } from '@tuturuuu/ui/hooks/use-calendar-preferences';
import { usePopoverManager } from '@tuturuuu/ui/hooks/use-popover-manager';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@tuturuuu/ui/hover-card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { isAllDayEvent } from '@tuturuuu/utils/calendar-utils';
import { cn } from '@tuturuuu/utils/format';
import { getTimeFormatPattern } from '@tuturuuu/utils/time-helper';
import {
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isSameMonth,
  isToday,
  startOfMonth,
} from 'date-fns';
import dayjs from 'dayjs';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import timezone from 'dayjs/plugin/timezone';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '../../popover';
import { getColorHighlight } from './color-highlights';
import { useCalendarSettings } from './settings/settings-context';

dayjs.extend(timezone);
dayjs.extend(isSameOrAfter);

interface MonthCalendarProps {
  date: Date;
  workspace?: Workspace;
  visibleDates?: Date[];
  viewedMonth?: Date;
}

interface MultiDayEventSegment {
  event: CalendarEvent;
  startCol: number;
  span: number;
  rowIndex: number;
  position: number; // Position in the all-day stack (0 = first, 1 = second, etc.)
}

const normalizeColor = (color: string): string => {
  if (!color) return 'primary';
  const normalized = color.trim().toLowerCase();

  // Map specific values to standardized names
  if (normalized === '#6b7280' || normalized === 'grey') return 'gray';

  return normalized;
};

const getDominantEventColor = (events: any[]): string => {
  if (events.length === 0) return 'primary';
  if (events.length === 1) return normalizeColor(events[0].color || 'primary');

  const colorCount = new Map<string, number>();
  for (const event of events) {
    const normalizedColor = normalizeColor(event.color || 'primary');
    colorCount.set(normalizedColor, (colorCount.get(normalizedColor) || 0) + 1);
  }

  let dominantColor = 'primary';
  let maxCount = -1;
  for (const [color, count] of colorCount) {
    if (count > maxCount) {
      dominantColor = color;
      maxCount = count;
    }
  }
  return dominantColor;
};

// Utility function for scroll shadow classes
const getScrollShadowClasses = (
  scrollState: { top: boolean; bottom: boolean } | undefined
) => {
  return cn(
    scrollState?.top &&
      'before:pointer-events-none before:absolute before:top-0 before:right-0 before:left-0 before:h-3 before:bg-linear-to-b before:from-muted/80 before:to-transparent',
    scrollState?.bottom &&
      'after:pointer-events-none after:absolute after:right-0 after:bottom-0 after:left-0 after:h-3 after:bg-linear-to-t after:from-muted/80 after:to-transparent'
  );
};

export const MonthCalendar = ({
  date,
  visibleDates,
  viewedMonth,
}: MonthCalendarProps) => {
  const { getCurrentEvents, addEmptyEvent, openModal } = useCalendar();
  const { settings } = useCalendarSettings();
  const { timeFormat } = useCalendarPreferences();
  const timePattern = getTimeFormatPattern(timeFormat);
  const [currDate, setCurrDate] = useState(date);
  const [hoveredDay, setHoveredDay] = useState<Date | null>(null);
  const tz = settings?.timezone?.timezone;

  // Layout constants for calendar dimensions and positioning
  const LAYOUT_CONSTANTS = {
    DAY_HEADER_HEIGHT: 28, // Height of day number and plus button area (h-7 + padding)
    CONTAINER_PADDING: 6, // p-1.5 = 6px padding
    EVENT_HEIGHT: 26, // Height of each event (increased for better readability)
    EVENT_SPACING: 4, // gap-1 = 4px spacing between events
    MARGIN_TOP: 6, // mt-1.5 = 6px margin top for events container
    MIN_DAY_HEIGHT: 140, // min-h-[140px] - increased for better event visibility
  } as const;

  // Layout constants for event display
  const MAX_ALL_DAY_VISIBLE = 2; // Maximum all-day events visible before overflow
  const MAX_TIMED_VISIBLE = 2; // Maximum timed events visible before overflow

  // Update currDate when date prop changes
  useEffect(() => {
    setCurrDate(date);
  }, [date]);

  // Get first day of week from settings or infer from visibleDates
  const firstDayOfWeek = useMemo(() => {
    const settingValue = settings?.appearance?.firstDayOfWeek;

    // If we have visibleDates, infer first day from the first date (most reliable)
    // The visibleDates from calendar-content are already calculated with the correct first day
    if (visibleDates && visibleDates.length > 0 && visibleDates[0]) {
      return visibleDates[0].getDay();
    }

    // Fallback to settings
    if (settingValue === 'sunday') return 0;
    if (settingValue === 'saturday') return 6;
    if (settingValue === 'monday') return 1;

    // 'auto' or undefined - default to Monday (locale detection happens in calendar-content)
    return 1;
  }, [settings?.appearance?.firstDayOfWeek, visibleDates]);

  // Get weekday labels based on first day of week
  const weekdayLabels = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const reorderedDays = [...days];

    // Reorder days based on first day of week
    for (let i = 0; i < firstDayOfWeek; i++) {
      const day = reorderedDays.shift();
      if (day) reorderedDays.push(day);
    }

    return reorderedDays;
  }, [firstDayOfWeek]);

  // Get days in month
  const monthStart = startOfMonth(currDate);
  const monthEnd = endOfMonth(currDate);
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Calculate days needed to fill the calendar grid (weeks)
  // Adjust startDay calculation based on first day of week
  const startDay = (getDay(monthStart) - firstDayOfWeek + 7) % 7;
  const endDay = 6 - ((getDay(monthEnd) - firstDayOfWeek + 7) % 7);

  // Get days from previous month to fill first week
  const prevMonthDays = [];
  for (let i = startDay - 1; i >= 0; i--) {
    const day =
      tz === 'auto'
        ? dayjs(monthStart)
            .subtract(i + 1, 'day')
            .toDate()
        : dayjs(monthStart)
            .tz(tz)
            .subtract(i + 1, 'day')
            .toDate();
    prevMonthDays.push(day);
  }

  // Get days from next month to fill last week
  const nextMonthDays = [];
  for (let i = 0; i < endDay; i++) {
    const day =
      tz === 'auto'
        ? dayjs(monthEnd)
            .add(i + 1, 'day')
            .toDate()
        : dayjs(monthEnd)
            .tz(tz)
            .add(i + 1, 'day')
            .toDate();
    nextMonthDays.push(day);
  }

  // Use visibleDates if provided, otherwise fallback to old logic
  const calendarDays = visibleDates ?? [
    ...prevMonthDays,
    ...monthDays,
    ...nextMonthDays,
  ];

  // Create weeks (group by 7 days)
  const weeks: Date[][] = [];
  for (let i = 0; i < calendarDays.length; i += 7) {
    weeks.push(calendarDays.slice(i, i + 7));
  }

  // Calculate multi-day event segments for rendering as spanning bars
  const multiDaySegments = useMemo(() => {
    const segments: MultiDayEventSegment[] = [];
    const processedInWeek = new Map<number, Set<string>>(); // week index -> set of event IDs

    weeks.forEach((week, rowIndex) => {
      const eventsInWeek = new Set<string>();
      const weekSegments: Array<{
        event: CalendarEvent;
        startCol: number;
        span: number;
      }> = [];

      // Find all multi-day events that overlap with this week
      week.forEach((day) => {
        const dayEvents = getCurrentEvents(day);

        dayEvents.forEach((event) => {
          if (!isAllDayEvent(event)) return;
          if (eventsInWeek.has(event.id)) return;

          const eventStart = dayjs(event.start_at);
          const eventEnd = dayjs(event.end_at);
          const durationDays = eventEnd.diff(eventStart, 'day');

          // Only process multi-day events (spanning 2+ days)
          if (durationDays <= 1) return;

          // Find which columns this event spans in this week
          let startCol = -1;
          let endCol = -1;

          week.forEach((weekDay, weekCol) => {
            const weekDayStart = dayjs(weekDay).startOf('day');
            const isInRange =
              weekDayStart.isSameOrAfter(eventStart, 'day') &&
              weekDayStart.isBefore(eventEnd, 'day');

            if (isInRange) {
              if (startCol === -1) startCol = weekCol;
              endCol = weekCol;
            }
          });

          if (startCol !== -1 && endCol !== -1 && endCol >= startCol) {
            weekSegments.push({
              event,
              startCol,
              span: endCol - startCol + 1,
            });
            eventsInWeek.add(event.id);
          }
        });
      });

      // Assign vertical positions to avoid overlaps
      weekSegments.sort((a, b) => {
        // Sort by start column, then by duration (longer first)
        if (a.startCol !== b.startCol) return a.startCol - b.startCol;
        return b.span - a.span;
      });

      const positions: number[] = [];
      weekSegments.forEach((seg, idx) => {
        // Simple greedy assignment - find first available position
        let position = 0;
        const usedPositions = new Set(
          weekSegments.slice(0, idx).map((_, i) => {
            const otherSeg = weekSegments[i];
            const overlaps =
              (otherSeg?.startCol || 0) < seg.startCol + seg.span &&
              (otherSeg?.startCol || 0) + (otherSeg?.span || 0) > seg.startCol;
            return overlaps ? positions[i] : -1;
          })
        );

        while (usedPositions.has(position)) {
          position++;
        }

        positions.push(position);
        segments.push({
          ...seg,
          rowIndex,
          position,
        });
      });

      processedInWeek.set(rowIndex, eventsInWeek);
    });

    return segments;
  }, [getCurrentEvents]);

  // Get single-day all-day events for a day (multi-day events rendered separately as bars)
  const getSingleDayAllDayEvents = useCallback(
    (day: Date) => {
      const dayEvents = getCurrentEvents(day);
      const allDayEvents: CalendarEvent[] = [];

      dayEvents.forEach((event) => {
        if (isAllDayEvent(event)) {
          const eventStart = dayjs(event.start_at);
          const eventEnd = dayjs(event.end_at);
          const durationDays = eventEnd.diff(eventStart, 'day');

          // Only include single-day all-day events
          if (durationDays <= 1) {
            allDayEvents.push(event);
          }
        }
      });

      // Sort by start time
      allDayEvents.sort((a, b) => {
        const aStart = new Date(a.start_at).getTime();
        const bStart = new Date(b.start_at).getTime();
        return aStart - bStart;
      });

      return allDayEvents;
    },
    [getCurrentEvents]
  );

  // Get timed events for a day
  const getTimedEventsForDay = useCallback(
    (day: Date) => {
      const dayEvents = getCurrentEvents(day);
      const timedEvents: CalendarEvent[] = [];

      dayEvents.forEach((event) => {
        if (!isAllDayEvent(event)) {
          timedEvents.push(event);
        }
      });

      // Sort by start time
      timedEvents.sort((a, b) => {
        const aStart = new Date(a.start_at).getTime();
        const bStart = new Date(b.start_at).getTime();
        return aStart - bStart;
      });

      return timedEvents;
    },
    [getCurrentEvents]
  );

  // Handle adding a new event
  const handleAddEvent = (day: Date) => {
    // Create event at 9:00 AM on the selected day
    const eventDate =
      tz === 'auto'
        ? dayjs(day).hour(9).minute(0).second(0).millisecond(0).toDate()
        : dayjs(day).tz(tz).hour(9).minute(0).second(0).millisecond(0).toDate();
    addEmptyEvent(eventDate);
  };

  const formatEventTime = (event: any) => {
    try {
      const start = new Date(event.start_at);
      const end = new Date(event.end_at);
      return `${format(start, timePattern)} - ${format(end, timePattern)}`;
    } catch (_) {
      return '';
    }
  };

  // Get color styles for an event using dynamic color tokens
  const getEventStyles = (
    event: any
  ): { bg: string; text: string; border: string } => {
    const colorMap: Record<
      string,
      { bg: string; text: string; border: string }
    > = {
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
    return (
      normalizedColor && colorMap[normalizedColor]
        ? colorMap[normalizedColor]
        : colorMap.blue
    ) as {
      bg: string;
      text: string;
      border: string;
    };
  };

  // Memoize dominant color for each day
  const dominantColorForDay = useMemo(() => {
    const map: Record<string, string> = {};
    for (const day of calendarDays) {
      const events = getCurrentEvents(day);
      map[day.toISOString()] = getDominantEventColor(events);
    }
    return map;
  }, [calendarDays, getCurrentEvents]);

  // Use the custom popover manager hook
  const {
    moreButtonRefs,
    popoverContentRefs,
    openPopoverIdx,
    setOpenPopoverIdx,
    scrollStates,
    setPopoverHovered,
    handlePopoverScroll,
  } = usePopoverManager();

  return (
    <div className="flex-1 overflow-auto rounded-md border bg-background shadow-sm">
      <div className="grid grid-cols-7 divide-x divide-y border-b text-center">
        {weekdayLabels.map((day) => (
          <div
            key={day}
            className={cn(
              'py-2 font-medium text-sm',
              (day === 'Sun' || day === 'Sat') &&
                !settings.appearance.showWeekends
                ? 'text-muted-foreground/50'
                : 'text-muted-foreground'
            )}
          >
            {day}
          </div>
        ))}
      </div>

      <div className="relative">
        {weeks.map((week, weekIndex) => (
          <div key={`week-${weekIndex}`} className="relative">
            {/* Multi-day event bars for this week */}
            <div className="pointer-events-none absolute inset-0 z-10">
              {multiDaySegments
                .filter((seg) => seg.rowIndex === weekIndex)
                .map((segment) => {
                  const { event, startCol, span, position } = segment;
                  const { bg, text, border } = getEventStyles(event);

                  const eventHeight = LAYOUT_CONSTANTS.EVENT_HEIGHT;
                  const dayHeaderHeight = LAYOUT_CONSTANTS.DAY_HEADER_HEIGHT;
                  const containerPadding = LAYOUT_CONSTANTS.CONTAINER_PADDING;
                  const marginTop = LAYOUT_CONSTANTS.MARGIN_TOP;
                  const eventSpacing = LAYOUT_CONSTANTS.EVENT_SPACING;

                  const topOffset =
                    dayHeaderHeight +
                    containerPadding +
                    marginTop +
                    position * (eventHeight + eventSpacing);

                  const leftPercent = (startCol / 7) * 100;
                  const widthPercent = (span / 7) * 100;

                  return (
                    <HoverCard
                      key={`segment-${event.id}-${weekIndex}`}
                      openDelay={200}
                      closeDelay={100}
                    >
                      <HoverCardTrigger asChild>
                        <div
                          className={cn(
                            'pointer-events-auto absolute cursor-pointer truncate rounded-md border border-l-2 px-2 py-1 font-medium text-xs transition-all hover:shadow-sm',
                            bg,
                            text,
                            border
                          )}
                          style={{
                            left: `calc(${leftPercent}% + ${containerPadding}px)`,
                            width: `calc(${widthPercent}% - ${containerPadding * 2}px)`,
                            top: `${topOffset}px`,
                            height: `${eventHeight}px`,
                            lineHeight: `${eventHeight - 8}px`,
                          }}
                          onClick={() => openModal(event.id)}
                        >
                          {event.title || 'Untitled event'}
                        </div>
                      </HoverCardTrigger>
                      <HoverCardContent
                        side="right"
                        align="start"
                        className="w-80"
                      >
                        <div className="space-y-2">
                          <h4 className="wrap-break-word line-clamp-2 font-semibold">
                            {event.title || 'Untitled event'}
                          </h4>
                          {event.description && (
                            <div
                              className="text-muted-foreground text-sm [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-primary/80"
                              dangerouslySetInnerHTML={{
                                __html: event.description,
                              }}
                            />
                          )}
                          <div className="flex items-center text-muted-foreground text-xs">
                            <Clock className="mr-1.5 h-3.5 w-3.5" />
                            <span>
                              All day • {dayjs(event.start_at).format('MMM D')}{' '}
                              -{' '}
                              {dayjs(event.end_at)
                                .subtract(1, 'day')
                                .format('MMM D')}
                            </span>
                          </div>
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  );
                })}
            </div>

            {/* Week row grid */}
            <div className="grid grid-cols-7 divide-x divide-y">
              {week.map((day, dayIdx) => {
                const globalDayIdx = weekIndex * 7 + dayIdx;
                const dominantColor =
                  dominantColorForDay[day.toISOString()] || 'primary';
                const highlightClass = isToday(day)
                  ? `${getColorHighlight(dominantColor)} z-10`
                  : '';

                const isCurrentMonth = isSameMonth(
                  day,
                  viewedMonth ?? currDate
                );
                const isTodayDate = isToday(day);
                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                const isHidden = isWeekend && !settings.appearance.showWeekends;
                const isHovered =
                  hoveredDay &&
                  hoveredDay.getDate() === day.getDate() &&
                  hoveredDay.getMonth() === day.getMonth() &&
                  hoveredDay.getFullYear() === day.getFullYear();

                return (
                  <div
                    key={day.toString()}
                    className={cn(
                      'group relative min-h-[140px] p-1.5 transition-colors',
                      !isCurrentMonth && 'bg-muted/50',
                      highlightClass,
                      isHovered && 'bg-muted/30',
                      isHidden && 'bg-muted/10'
                    )}
                    onMouseEnter={() => setHoveredDay(day)}
                    onMouseLeave={() => setHoveredDay(null)}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          'flex h-7 w-7 items-center justify-center text-sm',
                          isTodayDate &&
                            'rounded-full bg-primary font-medium text-primary-foreground',
                          !isCurrentMonth && 'text-muted-foreground',
                          isHidden && 'text-muted-foreground/50'
                        )}
                      >
                        {format(day, 'd')}
                      </span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                              'h-6 w-6 opacity-0 hover:bg-primary/10 hover:opacity-100 focus:opacity-100 group-hover:opacity-100',
                              isHidden && 'opacity-0 group-hover:opacity-50'
                            )}
                            onClick={() => handleAddEvent(day)}
                            disabled={isHidden}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Add event</TooltipContent>
                      </Tooltip>
                    </div>

                    {/* Events container with separated sections */}
                    <div className="mt-1.5 flex flex-col gap-1">
                      {/* Reserve space for multi-day event segments */}
                      {multiDaySegments
                        .filter((seg) => {
                          const week = weeks[seg.rowIndex];
                          if (!week) return false;
                          const isInRange =
                            dayIdx >= seg.startCol &&
                            dayIdx < seg.startCol + seg.span;
                          return seg.rowIndex === weekIndex && isInRange;
                        })
                        .sort((a, b) => a.position - b.position)
                        .map((seg) => (
                          <div
                            key={`placeholder-${seg.event.id}-${dayIdx}`}
                            className="pointer-events-none opacity-0"
                            style={{
                              height: `${LAYOUT_CONSTANTS.EVENT_HEIGHT}px`,
                            }}
                            aria-hidden="true"
                          />
                        ))}

                      {/* All-day events section */}
                      {getSingleDayAllDayEvents(day)
                        .slice(0, MAX_ALL_DAY_VISIBLE)
                        .map((event) => {
                          const { bg, text, border } = getEventStyles(event);

                          return (
                            <HoverCard
                              key={event.id}
                              openDelay={200}
                              closeDelay={100}
                            >
                              <HoverCardTrigger asChild>
                                <div
                                  className={cn(
                                    'group/event cursor-pointer truncate rounded-md border px-2 py-1 font-medium text-xs transition-all hover:shadow-sm',
                                    bg,
                                    text,
                                    border,
                                    !isCurrentMonth && 'opacity-50'
                                  )}
                                  onClick={() => openModal(event.id)}
                                >
                                  {event.title || 'Untitled'}
                                </div>
                              </HoverCardTrigger>
                              <HoverCardContent
                                side="right"
                                align="start"
                                className="w-80"
                              >
                                <div className="space-y-2">
                                  <h4 className="wrap-break-word line-clamp-2 font-semibold">
                                    {event.title || 'Untitled event'}
                                  </h4>
                                  {event.description && (
                                    <div
                                      className="text-muted-foreground text-sm [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-primary/80"
                                      dangerouslySetInnerHTML={{
                                        __html: event.description,
                                      }}
                                    />
                                  )}
                                  <div className="flex items-center text-muted-foreground text-xs">
                                    <Clock className="mr-1.5 h-3.5 w-3.5" />
                                    <span>All day</span>
                                  </div>
                                </div>
                              </HoverCardContent>
                            </HoverCard>
                          );
                        })}

                      {/* Separator between all-day and timed events */}
                      {getSingleDayAllDayEvents(day).length > 0 &&
                        getTimedEventsForDay(day).length > 0 && (
                          <div className="my-0.5 border-border/50 border-t" />
                        )}

                      {/* Timed events section */}
                      {getTimedEventsForDay(day)
                        .slice(0, MAX_TIMED_VISIBLE)
                        .map((event) => {
                          const { bg, text, border } = getEventStyles(event);
                          const eventTime = format(
                            new Date(event.start_at),
                            'HH:mm'
                          );

                          return (
                            <HoverCard
                              key={event.id}
                              openDelay={200}
                              closeDelay={100}
                            >
                              <HoverCardTrigger asChild>
                                <div
                                  className={cn(
                                    'group/event flex cursor-pointer items-start gap-1.5 rounded-md border px-2 py-1 text-xs transition-all',
                                    bg,
                                    text,
                                    border,
                                    !isCurrentMonth && 'opacity-50',
                                    'hover:shadow-sm'
                                  )}
                                  onClick={() => openModal(event.id)}
                                >
                                  <span className="shrink-0 font-medium opacity-70">
                                    {eventTime}
                                  </span>
                                  <span className="min-w-0 flex-1 truncate font-medium">
                                    {event.title || 'Untitled'}
                                  </span>
                                </div>
                              </HoverCardTrigger>
                              <HoverCardContent
                                side="right"
                                align="start"
                                className="w-80"
                              >
                                <div className="space-y-2">
                                  <h4 className="wrap-break-word line-clamp-2 font-semibold">
                                    {event.title || 'Untitled event'}
                                  </h4>
                                  {event.description && (
                                    <div
                                      className="text-muted-foreground text-sm [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-primary/80"
                                      dangerouslySetInnerHTML={{
                                        __html: event.description,
                                      }}
                                    />
                                  )}
                                  <div className="flex items-center text-muted-foreground text-xs">
                                    <Clock className="mr-1.5 h-3.5 w-3.5" />
                                    <span>{formatEventTime(event)}</span>
                                  </div>
                                </div>
                              </HoverCardContent>
                            </HoverCard>
                          );
                        })}

                      {/* Overflow indicator */}
                      {(() => {
                        const allDayEvents = getSingleDayAllDayEvents(day);
                        const timedEvents = getTimedEventsForDay(day);
                        const visibleCount =
                          Math.min(allDayEvents.length, MAX_ALL_DAY_VISIBLE) +
                          Math.min(timedEvents.length, MAX_TIMED_VISIBLE);
                        const totalCount =
                          allDayEvents.length + timedEvents.length;
                        const remainingCount = totalCount - visibleCount;

                        if (remainingCount <= 0) return null;

                        return (
                          <Popover
                            open={openPopoverIdx === globalDayIdx}
                            onOpenChange={(open) =>
                              setOpenPopoverIdx(open ? globalDayIdx : null)
                            }
                          >
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                ref={(el) => {
                                  moreButtonRefs.current[globalDayIdx] = el;
                                }}
                                className={cn(
                                  'w-full rounded-md bg-muted px-2 py-1 font-medium text-muted-foreground text-xs transition-colors hover:bg-muted/80',
                                  !isCurrentMonth && 'opacity-50'
                                )}
                                onClick={() => setOpenPopoverIdx(globalDayIdx)}
                              >
                                +{remainingCount} more
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              align="start"
                              className={cn(
                                'relative max-h-64 overflow-y-auto p-2 transition-none!',
                                getScrollShadowClasses(
                                  scrollStates[globalDayIdx]
                                )
                              )}
                              style={{
                                width:
                                  moreButtonRefs.current[globalDayIdx]
                                    ?.offsetWidth || undefined,
                              }}
                            >
                              <div
                                className="flex flex-col gap-1.5"
                                onScroll={(e) =>
                                  handlePopoverScroll(e, globalDayIdx)
                                }
                                ref={(el) => {
                                  popoverContentRefs.current[globalDayIdx] = el;
                                }}
                                onMouseEnter={() =>
                                  setPopoverHovered((prev) => ({
                                    ...prev,
                                    [globalDayIdx]: true,
                                  }))
                                }
                                onMouseLeave={() =>
                                  setPopoverHovered((prev) => ({
                                    ...prev,
                                    [globalDayIdx]: false,
                                  }))
                                }
                              >
                                {/* Overflow all-day events */}
                                {allDayEvents
                                  .slice(MAX_ALL_DAY_VISIBLE)
                                  .map((event) => {
                                    const { bg, text, border } =
                                      getEventStyles(event);
                                    return (
                                      <div
                                        key={event.id}
                                        className={cn(
                                          'cursor-pointer truncate rounded-md border px-2 py-1 font-medium text-xs',
                                          bg,
                                          text,
                                          border,
                                          !isCurrentMonth && 'opacity-50'
                                        )}
                                        onClick={() => openModal(event.id)}
                                      >
                                        {event.title || 'Untitled'}
                                      </div>
                                    );
                                  })}

                                {/* Separator in popover if needed */}
                                {allDayEvents.length > MAX_ALL_DAY_VISIBLE &&
                                  timedEvents.length > MAX_TIMED_VISIBLE && (
                                    <div className="my-0.5 border-border/50 border-t" />
                                  )}

                                {/* Overflow timed events */}
                                {timedEvents
                                  .slice(MAX_TIMED_VISIBLE)
                                  .map((event) => {
                                    const { bg, text, border } =
                                      getEventStyles(event);
                                    const eventTime = format(
                                      new Date(event.start_at),
                                      'HH:mm'
                                    );
                                    return (
                                      <div
                                        key={event.id}
                                        className={cn(
                                          'flex cursor-pointer items-start gap-1.5 rounded-md border px-2 py-1 text-xs',
                                          bg,
                                          text,
                                          border,
                                          !isCurrentMonth && 'opacity-50'
                                        )}
                                        onClick={() => openModal(event.id)}
                                      >
                                        <span className="shrink-0 font-medium opacity-70">
                                          {eventTime}
                                        </span>
                                        <span className="min-w-0 flex-1 truncate font-medium">
                                          {event.title || 'Untitled'}
                                        </span>
                                      </div>
                                    );
                                  })}
                              </div>
                            </PopoverContent>
                          </Popover>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
