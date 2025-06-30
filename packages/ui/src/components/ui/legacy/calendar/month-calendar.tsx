'use client';

import type { Workspace } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
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
import timezone from 'dayjs/plugin/timezone';
import { Clock, Plus } from 'lucide-react';
import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useCalendar } from '../../../../hooks/use-calendar';
import { COLOR_HIGHLIGHTS } from './color-highlights';
import { Popover, PopoverTrigger, PopoverContent } from '../../popover';

dayjs.extend(timezone);

interface MonthCalendarProps {
  date: Date;
  workspace?: Workspace;
  visibleDates?: Date[];
  viewedMonth?: Date;
}

const normalizeColor = (color: string): string => {
  if (!color) return 'primary';
  const normalized = color.trim().toLowerCase();
  // Map specific hex codes to color names
  if (normalized === '#6b7280' || normalized === 'grey') return 'gray';
  // Handle 6-digit hex
  if (/^#([0-9a-f]{6})$/i.test(normalized)) {
    // Add more mappings as needed
    return normalized;
  }
  // Handle 3-digit hex
  if (/^#([0-9a-f]{3})$/i.test(normalized)) {
    return normalized;
  }
  // Add more color name mappings if needed
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

// Custom hook for popover management
function usePopoverManager() {
  const moreButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const popoverContentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [openPopoverIdx, setOpenPopoverIdx] = useState<number | null>(null);
  const [scrollStates, setScrollStates] = useState<Record<number, { top: boolean; bottom: boolean }>>({});
  const [popoverHovered, setPopoverHovered] = useState<Record<number, boolean>>({});

  // Handler to close popover on scroll/resize
  useEffect(() => {
    if (openPopoverIdx !== null) {
      const handleClose = (event: Event) => {
        const popoverEl = popoverContentRefs.current[openPopoverIdx];
        if (popoverHovered[openPopoverIdx]) return;
        if (!popoverEl) {
          setOpenPopoverIdx(null);
          return;
        }
        if (event.target instanceof Node && popoverEl.contains(event.target as Node)) {
          return;
        }
        setOpenPopoverIdx(null);
      };
      window.addEventListener('scroll', handleClose, true);
      window.addEventListener('resize', handleClose);
      return () => {
        window.removeEventListener('scroll', handleClose, true);
        window.removeEventListener('resize', handleClose);
      };
    }
  }, [openPopoverIdx, popoverHovered]);

  // Set initial scroll state when popover opens
  useEffect(() => {
    if (openPopoverIdx !== null) {
      const el = popoverContentRefs.current[openPopoverIdx];
      if (el) {
        setScrollStates(prev => ({
          ...prev,
          [openPopoverIdx]: {
            top: el.scrollTop > 0,
            bottom: el.scrollTop + el.clientHeight < el.scrollHeight,
          },
        }));
      }
    }
  }, [openPopoverIdx]);

  // Helper to handle scroll shadow indicators
  const handlePopoverScroll = useCallback((e: React.UIEvent<HTMLDivElement>, idx: number) => {
    const el = e.currentTarget;
    setScrollStates((prev) => ({
      ...prev,
      [idx]: {
        top: el.scrollTop > 0,
        bottom: el.scrollTop + el.clientHeight < el.scrollHeight,
      },
    }));
  }, []);

  return {
    moreButtonRefs,
    popoverContentRefs,
    openPopoverIdx,
    setOpenPopoverIdx,
    scrollStates,
    popoverHovered,
    setPopoverHovered,
    handlePopoverScroll,
  };
}

export const MonthCalendar = ({ date, visibleDates, viewedMonth }: MonthCalendarProps) => {
  const { getCurrentEvents, addEmptyEvent, openModal, settings } =
    useCalendar();
  const [currDate, setCurrDate] = useState(date);
  const [hoveredDay, setHoveredDay] = useState<Date | null>(null);
  const tz = settings?.timezone?.timezone;

  // Update currDate when date prop changes
  useEffect(() => {
    setCurrDate(date);
  }, [date, tz]);

  // Get first day of week from settings
  const firstDayOfWeek = useMemo(() => {
    const settingValue = settings?.appearance?.firstDayOfWeek;
    console.log('Month calendar first day setting:', settingValue);
    return settingValue === 'sunday' ? 0 : settingValue === 'saturday' ? 6 : 1; // 0 = Sunday, 1 = Monday, 6 = Saturday
  }, [settings?.appearance?.firstDayOfWeek, tz]);

  // Get weekday labels based on first day of week
  const weekdayLabels = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const reorderedDays = [...days];

    console.log('Reordering days with first day:', firstDayOfWeek);

    // Reorder days based on first day of week
    for (let i = 0; i < firstDayOfWeek; i++) {
      reorderedDays.push(reorderedDays.shift()!);
    }

    console.log('Reordered days:', reorderedDays);

    return reorderedDays;
  }, [firstDayOfWeek, tz]);

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
  const calendarDays = visibleDates ?? [...prevMonthDays, ...monthDays, ...nextMonthDays];

  // Create weeks (group by 7 days)
  const weeks = [];
  for (let i = 0; i < calendarDays.length; i += 7) {
    weeks.push(calendarDays.slice(i, i + 7));
  }

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
    return (normalizedColor && colorMap[normalizedColor] ? colorMap[normalizedColor] : colorMap.blue) as {
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
              'py-2 text-sm font-medium',
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

      <div className="grid grid-cols-7 divide-x divide-y">
        {calendarDays.map((day, dayIdx) => {
          const dominantColor = dominantColorForDay[day.toISOString()] || 'primary';
          const highlightClass = isToday(day) ? `${COLOR_HIGHLIGHTS[dominantColor as keyof typeof COLOR_HIGHLIGHTS] ?? COLOR_HIGHLIGHTS.primary} z-10` : '';

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
                        'h-6 w-6 opacity-0 group-hover:opacity-100 hover:bg-primary/10 hover:opacity-100 focus:opacity-100',
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
                {getCurrentEvents(day).slice(0, 3).map((event) => {
                  const { bg, text } = getEventStyles(event);

                  return (
                    <HoverCard key={event.id} openDelay={200} closeDelay={100}>
                      <HoverCardTrigger asChild>
                        <div
                          className={cn(
                            'cursor-pointer items-center gap-1 truncate rounded px-1.5 py-1 text-xs font-medium',
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
                          <h4 className="line-clamp-2 font-medium break-words">
                            {event.title || 'Untitled event'}
                          </h4>
                          {event.description && (
                            <p className="text-sm text-muted-foreground">
                              {event.description}
                            </p>
                          )}
                          <div className="flex items-center text-xs text-muted-foreground">
                            <Clock className="mr-1 h-3 w-3" />
                            <span>{formatEventTime(event)}</span>
                          </div>
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  );
                })}

                {getCurrentEvents(day).length > 3 && (
                  <Popover open={openPopoverIdx === dayIdx} onOpenChange={open => setOpenPopoverIdx(open ? dayIdx : null)}>
                    <PopoverTrigger asChild>
                      <button
                        ref={el => { moreButtonRefs.current[dayIdx] = el; }}
                        className={cn(
                          'w-full rounded-sm bg-muted px-1 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted/80',
                          !isCurrentMonth && 'opacity-60'
                        )}
                        onClick={() => setOpenPopoverIdx(dayIdx)}
                      >
                        +{getCurrentEvents(day).length - 3} more
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className={cn(
                        'p-2 max-h-60 overflow-y-auto relative !transition-none',
                        scrollStates[dayIdx]?.top && 'before:absolute before:top-0 before:left-0 before:right-0 before:h-3 before:bg-gradient-to-b before:from-muted/80 before:to-transparent before:pointer-events-none',
                        scrollStates[dayIdx]?.bottom && 'after:absolute after:bottom-0 after:left-0 after:right-0 after:h-3 after:bg-gradient-to-t after:from-muted/80 after:to-transparent after:pointer-events-none'
                      )}
                      style={{ width: moreButtonRefs.current[dayIdx]?.offsetWidth || undefined }}
                    >
                      <div
                        className="flex flex-col gap-1"
                        onScroll={e => handlePopoverScroll(e, dayIdx)}
                        ref={el => { popoverContentRefs.current[dayIdx] = el; }}
                        onMouseEnter={() => setPopoverHovered(prev => ({ ...prev, [dayIdx]: true }))}
                        onMouseLeave={() => setPopoverHovered(prev => ({ ...prev, [dayIdx]: false }))}
                      >
                        {getCurrentEvents(day).slice(3).map((event) => {
                          const { bg, text } = getEventStyles(event);
                          return (
                            <div
                              key={event.id}
                              className={cn(
                                'cursor-pointer items-center gap-1 truncate rounded px-1.5 py-1 text-xs font-medium',
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
        })}
      </div>
    </div>
  );
};
