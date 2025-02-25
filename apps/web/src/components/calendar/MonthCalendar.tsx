'use client';

import { useCalendar } from '@/hooks/useCalendar';
import { Workspace } from '@tuturuuu/types/primitives/Workspace';
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
import { Clock, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';

interface MonthCalendarProps {
  date: Date;
  workspace: Workspace;
}

const MonthCalendar = ({ date }: MonthCalendarProps) => {
  const { getCurrentEvents, addEmptyEvent } = useCalendar();
  const [currDate, setCurrDate] = useState(date);
  const [hoveredDay, setHoveredDay] = useState<Date | null>(null);

  // Update currDate when date prop changes
  useEffect(() => {
    setCurrDate(date);
  }, [date]);

  // Get days in month
  const monthStart = startOfMonth(currDate);
  const monthEnd = endOfMonth(currDate);
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Calculate days needed to fill the calendar grid (weeks)
  const startDay = getDay(monthStart);
  const endDay = 6 - getDay(monthEnd);

  // Get days from previous month to fill first week
  const prevMonthDays = [];
  for (let i = startDay - 1; i >= 0; i--) {
    const day = new Date(monthStart);
    day.setDate(day.getDate() - (i + 1));
    prevMonthDays.push(day);
  }

  // Get days from next month to fill last week
  const nextMonthDays = [];
  for (let i = 0; i < endDay; i++) {
    const day = new Date(monthEnd);
    day.setDate(day.getDate() + i + 1);
    nextMonthDays.push(day);
  }

  // Combine all days
  const calendarDays = [...prevMonthDays, ...monthDays, ...nextMonthDays];

  // Create weeks (group by 7 days)
  const weeks = [];
  for (let i = 0; i < calendarDays.length; i += 7) {
    weeks.push(calendarDays.slice(i, i + 7));
  }

  // Handle adding a new event
  const handleAddEvent = (day: Date) => {
    // Create event at 9:00 AM on the selected day
    const eventDate = new Date(day);
    eventDate.setHours(9, 0, 0, 0);
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

    const color = event.color?.toLowerCase();
    return (color && colorMap[color] ? colorMap[color] : colorMap.blue) as {
      bg: string;
      text: string;
    };
  };

  return (
    <div className="flex-1 overflow-auto rounded-md border bg-background shadow-sm">
      <div className="grid grid-cols-7 divide-x divide-y border-b text-center">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div
            key={day}
            className="py-2 text-sm font-medium text-muted-foreground"
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 divide-x divide-y">
        {calendarDays.map((day) => {
          const events = getCurrentEvents();
          const isCurrentMonth = isSameMonth(day, currDate);
          const isTodayDate = isToday(day);
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
                isTodayDate && 'bg-primary/5',
                isHovered && 'bg-muted/30'
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
                    !isCurrentMonth && 'text-muted-foreground'
                  )}
                >
                  {format(day, 'd')}
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:bg-primary/10 hover:opacity-100 focus:opacity-100"
                      onClick={() => handleAddEvent(day)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Add event</TooltipContent>
                </Tooltip>
              </div>

              <div className="mt-1 space-y-1">
                {events.slice(0, 3).map((event) => {
                  const { bg, text } = getEventStyles(event);

                  return (
                    <HoverCard key={event.id} openDelay={200} closeDelay={100}>
                      <HoverCardTrigger asChild>
                        <div
                          className={cn(
                            'flex cursor-pointer items-center gap-1 truncate rounded px-1.5 py-1 text-xs font-medium',
                            bg,
                            text
                          )}
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
                          <h4 className="font-medium">
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

                {events.length > 3 && (
                  <button className="w-full rounded-sm bg-muted px-1 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted/80">
                    +{events.length - 3} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MonthCalendar;
