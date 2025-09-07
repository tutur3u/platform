'use client';

import { Popover, PopoverContent, PopoverTrigger } from '../../popover';
import { getColorHighlight } from './color-highlights';
import { useCalendarSettings } from './settings/settings-context';
import type { Workspace } from '@tuturuuu/types/db';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { Button } from '@tuturuuu/ui/button';
import { isAllDayEvent } from '@tuturuuu/ui/hooks/calendar-utils';
import { useCalendar } from '@tuturuuu/ui/hooks/use-calendar';
import { usePopoverManager } from '@tuturuuu/ui/hooks/use-popover-manager';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@tuturuuu/ui/hover-card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
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
import { Clock, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

dayjs.extend(timezone);
dayjs.extend(isSameOrAfter);

interface MonthCalendarProps {
  date: Date;
  workspace?: Workspace;
  visibleDates?: Date[];
  viewedMonth?: Date;
}

// Interface for multi-day event spans
interface EventSpan {
  event: CalendarEvent;
  startIndex: number;
  endIndex: number;
  span: number;
  weekIndex: number;
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
      'before:pointer-events-none before:absolute before:top-0 before:right-0 before:left-0 before:h-3 before:bg-gradient-to-b before:from-muted/80 before:to-transparent',
    scrollState?.bottom &&
      'after:pointer-events-none after:absolute after:right-0 after:bottom-0 after:left-0 after:h-3 after:bg-gradient-to-t after:from-muted/80 after:to-transparent'
  );
};

export const MonthCalendar = ({
  date,
  visibleDates,
  viewedMonth,
}: MonthCalendarProps) => {
  const { getCurrentEvents, addEmptyEvent, openModal } = useCalendar();
  const { settings } = useCalendarSettings();
  const [currDate, setCurrDate] = useState(date);
  const [hoveredDay, setHoveredDay] = useState<Date | null>(null);
  const tz = settings?.timezone?.timezone;

  // Layout constants for calendar dimensions and positioning
  const LAYOUT_CONSTANTS = {
    DAY_HEADER_HEIGHT: 28, // Height of day number and plus button area (h-7 + padding)
    CONTAINER_PADDING: 6, // p-1.5 = 6px padding
    EVENT_HEIGHT: 24, // Height of each event (px-1.5 py-1 text-xs)
    EVENT_SPACING: 4, // space-y-1 = 4px spacing between events
    MARGIN_TOP: 4, // mt-1 = 4px margin top for events container
    MIN_DAY_HEIGHT: 120, // min-h-[120px]
  } as const;

  // Event display priority constants
  const EVENT_DISPLAY_PRIORITY = {
    ALL_DAY: 1, // All-day events (highest priority)
    MULTI_DAY_FIRST: 2, // First day of multi-day timed events
    TIMED: 3, // Regular timed events (lowest priority)
  } as const;

  // Update currDate when date prop changes
  useEffect(() => {
    setCurrDate(date);
  }, [date]);

  // Get first day of week from settings
  const firstDayOfWeek = useMemo(() => {
    const settingValue = settings?.appearance?.firstDayOfWeek;
    console.log('Month calendar first day setting:', settingValue);
    return settingValue === 'sunday' ? 0 : settingValue === 'saturday' ? 6 : 1; // 0 = Sunday, 1 = Monday, 6 = Saturday
  }, [settings?.appearance?.firstDayOfWeek]);

  // Get weekday labels based on first day of week
  const weekdayLabels = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const reorderedDays = [...days];

    console.log('Reordering days with first day:', firstDayOfWeek);

    // Reorder days based on first day of week
    for (let i = 0; i < firstDayOfWeek; i++) {
      const day = reorderedDays.shift();
      if (day) reorderedDays.push(day);
    }

    console.log('Reordered days:', reorderedDays);

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

  // Process multi-day all-day events to create spans
  const multiDayEventSpans = useMemo(() => {
    const spans: EventSpan[] = [];
    const processedEvents = new Set<string>();

    weeks.forEach((week: Date[], weekIndex: number) => {
      week.forEach((day: Date) => {
        const dayEvents = getCurrentEvents(day);

        dayEvents.forEach((event) => {
          // Skip if already processed or not an all-day event
          if (processedEvents.has(event.id) || !isAllDayEvent(event)) {
            return;
          }

          const eventStart = dayjs(event.start_at);
          const eventEnd = dayjs(event.end_at);

          // Check if this is a multi-day event
          const durationDays = eventEnd.diff(eventStart, 'day');
          if (durationDays <= 1) {
            return; // Single day event, handle normally
          }

          // Find the span of this event within the current week
          let startIndex = -1;
          let endIndex = -1;

          week.forEach((weekDay: Date, weekDayIndex: number) => {
            const weekDayStart = dayjs(weekDay);

            // Check if event overlaps with this day
            if (
              weekDayStart.isSameOrAfter(eventStart, 'day') &&
              weekDayStart.isBefore(eventEnd, 'day')
            ) {
              if (startIndex === -1) {
                startIndex = weekDayIndex;
              }
              endIndex = weekDayIndex;
            }
          });

          if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
            spans.push({
              event,
              startIndex,
              endIndex,
              span: endIndex - startIndex + 1,
              weekIndex,
            });
            processedEvents.add(event.id);
          }
        });
      });
    });

    return spans;
  }, [getCurrentEvents]);

  // Get events for a day including placeholders for multi-day events
  const getEventsForDay = (day: Date) => {
    const dayEvents = getCurrentEvents(day);
    const result: (CalendarEvent & {
      isPlaceholder?: boolean;
      _eventPriority?: number;
    })[] = [];

    // Add all events with priority for sorting
    dayEvents.forEach((event) => {
      let eventPriority: number = EVENT_DISPLAY_PRIORITY.TIMED; // Default for timed events (lowest priority)

      if (isAllDayEvent(event)) {
        // Check if it's part of a multi-day span
        const isMultiDay = multiDayEventSpans.some(
          (span) => span.event.id === event.id
        );

        if (isMultiDay) {
          // Multi-day all-day event gets highest priority
          eventPriority = EVENT_DISPLAY_PRIORITY.ALL_DAY;
          result.push({
            ...event,
            isPlaceholder: true,
            _eventPriority: eventPriority,
          });
        } else {
          // Single-day all-day event gets medium priority
          eventPriority = EVENT_DISPLAY_PRIORITY.MULTI_DAY_FIRST;
          result.push({
            ...event,
            _eventPriority: eventPriority,
          });
        }
      } else {
        // Timed event gets lowest priority
        result.push({
          ...event,
          _eventPriority: eventPriority,
        });
      }
    });

    // Sort by priority (1 = highest priority, 3 = lowest priority)
    // Then by start time for events with the same priority
    result.sort((a, b) => {
      // First sort by priority
      if (a._eventPriority !== b._eventPriority) {
        return (
          (a._eventPriority || EVENT_DISPLAY_PRIORITY.TIMED) -
          (b._eventPriority || EVENT_DISPLAY_PRIORITY.TIMED)
        );
      }

      // For events with same priority, sort by start time
      const aStart = new Date(a.start_at).getTime();
      const bStart = new Date(b.start_at).getTime();
      return aStart - bStart;
    });

    return result;
  };

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
      return `${format(start, 'HH:mm')} - ${format(end, 'HH:mm')}`;
    } catch (e) {
      return '';
    }
  };

  // Get color styles for an event
  const getEventStyles = (event: any): { bg: string; text: string } => {
    const colorMap: Record<string, { bg: string; text: string }> = {
      blue: {
        bg: 'bg-blue-100/60 dark:bg-blue-900/30',
        text: 'text-blue-700 dark:text-blue-300',
      },
      red: {
        bg: 'bg-red-100/60 dark:bg-red-900/30',
        text: 'text-red-700 dark:text-red-300',
      },
      green: {
        bg: 'bg-green-100/60 dark:bg-green-900/30',
        text: 'text-green-700 dark:text-green-300',
      },
      purple: {
        bg: 'bg-purple-100/60 dark:bg-purple-900/30',
        text: 'text-purple-700 dark:text-purple-300',
      },
      yellow: {
        bg: 'bg-yellow-100/60 dark:bg-yellow-900/30',
        text: 'text-yellow-700 dark:text-yellow-300',
      },
      orange: {
        bg: 'bg-orange-100/60 dark:bg-orange-900/30',
        text: 'text-orange-700 dark:text-orange-300',
      },
      pink: {
        bg: 'bg-pink-100/60 dark:bg-pink-900/30',
        text: 'text-pink-700 dark:text-pink-300',
      },
      cyan: {
        bg: 'bg-cyan-100/60 dark:bg-cyan-900/30',
        text: 'text-cyan-700 dark:text-cyan-300',
      },
      indigo: {
        bg: 'bg-indigo-100/60 dark:bg-indigo-900/30',
        text: 'text-indigo-700 dark:text-indigo-300',
      },
      gray: {
        bg: 'bg-gray-100/60 dark:bg-gray-900/30',
        text: 'text-gray-700 dark:text-gray-300',
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
  }, [
    calendarDays,
    JSON.stringify(
      calendarDays.map((day) =>
        getCurrentEvents(day).map((e) => e.id + e.color)
      )
    ),
  ]);

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
        <div className="grid grid-cols-7 divide-x divide-y" id="calendar-grid">
          {weeks.map((week, weekIndex) =>
            week.map((day, dayIdx) => {
              const globalDayIdx = weekIndex * 7 + dayIdx;
              const dominantColor =
                dominantColorForDay[day.toISOString()] || 'primary';
              const highlightClass = isToday(day)
                ? `${getColorHighlight(dominantColor)} z-10`
                : '';

              const isCurrentMonth = isSameMonth(day, viewedMonth ?? currDate);
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
                    'group relative min-h-[120px] p-1.5 transition-colors',
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

                  <div className="mt-1 space-y-1">
                    {getEventsForDay(day)
                      .slice(0, 3)
                      .map((event) => {
                        // Skip rendering placeholder events (they're handled by the spanning elements)
                        if (event.isPlaceholder) {
                          return (
                            <div
                              key={event.id}
                              className="pointer-events-none px-1.5 py-1 font-medium text-xs opacity-0"
                              style={{
                                height: `${LAYOUT_CONSTANTS.EVENT_HEIGHT}px`,
                              }}
                              aria-hidden="true"
                            />
                          );
                        }

                        const { bg, text } = getEventStyles(event);

                        return (
                          <HoverCard
                            key={event.id}
                            openDelay={200}
                            closeDelay={100}
                          >
                            <HoverCardTrigger asChild>
                              <div
                                className={cn(
                                  'cursor-pointer items-center gap-1 truncate rounded px-1.5 py-1 font-medium text-xs',
                                  bg,
                                  text,
                                  !isCurrentMonth && 'opacity-60'
                                )}
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
                                <h4 className="line-clamp-2 break-words font-medium">
                                  {event.title || 'Untitled event'}
                                </h4>
                                {event.description && (
                                  <p className="text-muted-foreground text-sm">
                                    {event.description}
                                  </p>
                                )}
                                <div className="flex items-center text-muted-foreground text-xs">
                                  <Clock className="mr-1 h-3 w-3" />
                                  <span>{formatEventTime(event)}</span>
                                </div>
                              </div>
                            </HoverCardContent>
                          </HoverCard>
                        );
                      })}

                    {getEventsForDay(day).length > 3 && (
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
                              'w-full rounded-sm bg-muted px-1 py-0.5 font-medium text-muted-foreground text-xs hover:bg-muted/80',
                              !isCurrentMonth && 'opacity-60'
                            )}
                            onClick={() => setOpenPopoverIdx(globalDayIdx)}
                          >
                            +{getEventsForDay(day).length - 3} more
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className={cn(
                            '!transition-none relative max-h-60 overflow-y-auto p-2',
                            getScrollShadowClasses(scrollStates[globalDayIdx])
                          )}
                          style={{
                            width:
                              moreButtonRefs.current[globalDayIdx]
                                ?.offsetWidth || undefined,
                          }}
                        >
                          <div
                            className="flex flex-col gap-1"
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
                            {getEventsForDay(day)
                              .slice(3)
                              .map((event) => {
                                // Skip rendering placeholder events in popover too
                                if (event.isPlaceholder) {
                                  return null;
                                }

                                const { bg, text } = getEventStyles(event);
                                return (
                                  <div
                                    key={event.id}
                                    className={cn(
                                      'cursor-pointer items-center gap-1 truncate rounded px-1.5 py-1 font-medium text-xs',
                                      bg,
                                      text,
                                      !isCurrentMonth && 'opacity-60'
                                    )}
                                    onClick={() => openModal(event.id)}
                                  >
                                    {event.title || 'Untitled event'}
                                  </div>
                                );
                              })}
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Render multi-day all-day event spans */}
        {multiDayEventSpans.map((eventSpan) => {
          const { event, startIndex, span, weekIndex } = eventSpan;
          const { bg, text } = getEventStyles(event);

          // Calculate position for the spanning event to align with day container events
          const dayHeaderHeight = LAYOUT_CONSTANTS.DAY_HEADER_HEIGHT; // Height of day number and plus button area (h-7 + padding)
          const containerPadding = LAYOUT_CONSTANTS.CONTAINER_PADDING; // p-1.5 = 6px padding
          const eventHeight = LAYOUT_CONSTANTS.EVENT_HEIGHT; // Height of each event (px-1.5 py-1 text-xs) - match exactly
          const eventSpacing = LAYOUT_CONSTANTS.EVENT_SPACING; // space-y-1 = 4px spacing between events
          const marginTop = LAYOUT_CONSTANTS.MARGIN_TOP; // mt-1 = 4px margin top for events container

          // Find the position of this event in the first day it appears
          const firstDayIndex = weekIndex * 7 + startIndex;
          const firstDay = calendarDays[firstDayIndex];

          let eventIndexInDay = 0;
          if (firstDay) {
            const eventsInFirstDay = getEventsForDay(firstDay);
            // Find the placeholder for this multi-day event in the sorted list
            eventIndexInDay = eventsInFirstDay.findIndex(
              (e) => e.id === event.id && e.isPlaceholder
            );
            if (eventIndexInDay === -1) {
              // Fallback: if not found as placeholder, check for any event with this ID
              eventIndexInDay = eventsInFirstDay.findIndex(
                (e) => e.id === event.id
              );
            }
            if (eventIndexInDay === -1) {
              // If still not found, put it at the top (should not happen with correct logic)
              eventIndexInDay = 0;
            }
          }

          // Fixed positioning approach based on empirical observation
          // Use a more accurate measurement approach
          let rowTop = 0;

          // Calculate the top position for each row more accurately
          for (let i = 0; i < weekIndex; i++) {
            const weekDays = weeks[i] || [];
            let maxEvents = 0;
            let hasMoreButton = false;

            // Get the actual maximum events per day in this week
            weekDays.forEach((day: Date) => {
              const dayEvents = getEventsForDay(day);
              maxEvents = Math.max(maxEvents, Math.min(dayEvents.length, 3));
              if (dayEvents.length > 3) hasMoreButton = true;
            });

            // More precise height calculation matching CSS behavior
            const dayHeaderHeight = LAYOUT_CONSTANTS.DAY_HEADER_HEIGHT; // Height of day number header
            const containerPadding = LAYOUT_CONSTANTS.CONTAINER_PADDING; // p-1.5 = 6px padding
            const minContentHeight =
              LAYOUT_CONSTANTS.MIN_DAY_HEIGHT -
              dayHeaderHeight -
              containerPadding * 2; // min-h-[120px] minus header and padding

            let contentHeight = minContentHeight;
            if (maxEvents > 0) {
              const eventsHeight =
                maxEvents * eventHeight + (maxEvents - 1) * eventSpacing; // 24px per event + 4px spacing between
              const moreButtonHeight = hasMoreButton ? eventHeight : 0;
              const marginAndPadding = 8; // Additional margin around events
              contentHeight = Math.max(
                minContentHeight,
                eventsHeight + moreButtonHeight + marginAndPadding
              );
            }

            const totalRowHeight =
              dayHeaderHeight + containerPadding * 2 + contentHeight;
            rowTop += totalRowHeight;
          }

          // Position within the current row
          const positionInRow =
            dayHeaderHeight +
            containerPadding +
            marginTop +
            eventIndexInDay * (eventHeight + eventSpacing);
          const eventTopPosition = rowTop + positionInRow;

          return (
            <HoverCard
              key={`span-${event.id}-${weekIndex}`}
              openDelay={200}
              closeDelay={100}
            >
              <HoverCardTrigger asChild>
                <div
                  className={cn(
                    'absolute z-20 cursor-pointer truncate rounded px-1.5 py-1 font-medium text-xs',
                    bg,
                    text,
                    'border-l-2 border-l-current'
                  )}
                  style={{
                    left: `calc(${(startIndex / 7) * 100}% + ${containerPadding}px)`,
                    width: `calc(${(span / 7) * 100}% - ${containerPadding * 2}px)`,
                    top: `${eventTopPosition}px`,
                    height: `${eventHeight}px`,
                    lineHeight: `${eventHeight - 8}px`,
                  }}
                  onClick={() => openModal(event.id)}
                >
                  {event.title || 'Untitled event'}
                </div>
              </HoverCardTrigger>
              <HoverCardContent side="right" align="start" className="w-80">
                <div className="space-y-2">
                  <h4 className="line-clamp-2 break-words font-medium">
                    {event.title || 'Untitled event'}
                  </h4>
                  {event.description && (
                    <p className="text-muted-foreground text-sm">
                      {event.description}
                    </p>
                  )}
                  <div className="flex items-center text-muted-foreground text-xs">
                    <Clock className="mr-1 h-3 w-3" />
                    <span>
                      All day • {dayjs(event.start_at).format('MMM D')} -{' '}
                      {dayjs(event.end_at).subtract(1, 'day').format('MMM D')}
                    </span>
                  </div>
                </div>
              </HoverCardContent>
            </HoverCard>
          );
        })}
      </div>
    </div>
  );
};
