'use client';

import { cn } from '@tuturuuu/utils/format';
import { addDays, format, startOfWeek } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

type EventColor = 'blue' | 'green' | 'purple' | 'orange' | 'cyan';

interface DemoEvent {
  id: string;
  title: string;
  startDay: number; // 0-6 (Mon-Sun)
  endDay: number; // 0-6 (Mon-Sun)
  startHour?: number; // 0-23
  endHour?: number; // 0-23
  color: EventColor;
  isMultiDay?: boolean;
}

// Enhanced event styling using calendar-specific colors
const eventColorClasses: Record<EventColor, string> = {
  blue: 'bg-calendar-bg-blue border-l-dynamic-light-blue text-dynamic-light-blue hover:ring-1 hover:ring-dynamic-light-blue/50',
  green:
    'bg-calendar-bg-green border-l-dynamic-light-green text-dynamic-light-green hover:ring-1 hover:ring-dynamic-light-green/50',
  purple:
    'bg-calendar-bg-purple border-l-dynamic-light-purple text-dynamic-light-purple hover:ring-1 hover:ring-dynamic-light-purple/50',
  orange:
    'bg-calendar-bg-orange border-l-dynamic-light-orange text-dynamic-light-orange hover:ring-1 hover:ring-dynamic-light-orange/50',
  cyan: 'bg-calendar-bg-cyan border-l-dynamic-light-cyan text-dynamic-light-cyan hover:ring-1 hover:ring-dynamic-light-cyan/50',
};

// Multi-day event styling using calendar-specific colors
const multiDayColorClasses: Record<EventColor, string> = {
  blue: 'bg-calendar-bg-blue text-dynamic-light-blue border border-dynamic-light-blue/30',
  green:
    'bg-calendar-bg-green text-dynamic-light-green border border-dynamic-light-green/30',
  purple:
    'bg-calendar-bg-purple text-dynamic-light-purple border border-dynamic-light-purple/30',
  orange:
    'bg-calendar-bg-orange text-dynamic-light-orange border border-dynamic-light-orange/30',
  cyan: 'bg-calendar-bg-cyan text-dynamic-light-cyan border border-dynamic-light-cyan/30',
};

function TimeSlotEvent({
  event,
  style,
  isSmall,
}: {
  event: DemoEvent;
  style?: React.CSSProperties;
  isSmall?: boolean;
}) {
  return (
    <div
      className={cn(
        'absolute inset-x-1.5 cursor-pointer overflow-hidden rounded-lg border-l-[3px] px-2 font-medium text-[10px] transition-all duration-200 hover:scale-[1.02]',
        // For small events, use flexbox to center content vertically
        isSmall ? 'flex items-center' : 'py-1',
        eventColorClasses[event.color]
      )}
      style={style}
    >
      {isSmall ? (
        // Small event - just centered title
        <div className="truncate font-semibold">{event.title}</div>
      ) : (
        // Larger event - title + time
        <div>
          <div className="truncate font-semibold">{event.title}</div>
          {event.startHour !== undefined && (
            <div className="mt-0.5 text-[9px] opacity-75">
              {format(new Date().setHours(event.startHour, 0), 'h:mm a')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MultiDayEvent({
  event,
  isStart,
  isEnd,
}: {
  event: DemoEvent;
  isStart: boolean;
  isEnd: boolean;
}) {
  return (
    <div
      className={cn(
        'relative h-6 cursor-pointer overflow-hidden font-semibold text-[10px] leading-6 transition-all duration-200 hover:brightness-110',
        multiDayColorClasses[event.color],
        isStart ? 'ml-1.5 rounded-l-lg pl-2.5' : 'pl-1',
        isEnd ? 'mr-1.5 rounded-r-lg' : ''
      )}
    >
      {isStart && <span className="truncate">{event.title}</span>}
    </div>
  );
}

function CalendarHeader({ days }: { days: Date[] }) {
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');

  return (
    <div className="grid grid-cols-[40px_repeat(5,1fr)] border-border/30 border-b bg-gradient-to-b from-muted/40 to-transparent">
      <div className="p-1.5" />
      {days.map((day, idx) => {
        const isToday = format(day, 'yyyy-MM-dd') === todayStr;
        return (
          <div
            key={idx}
            className={cn(
              'border-border/15 border-l p-2 text-center transition-colors',
              isToday && 'bg-primary/8'
            )}
          >
            <div
              className={cn(
                'font-semibold text-[9px] uppercase tracking-wider',
                isToday ? 'text-primary' : 'text-muted-foreground/80'
              )}
            >
              {format(day, 'EEE', { locale: enUS })}
            </div>
            <div
              className={cn(
                'mx-auto mt-1 flex h-7 w-7 items-center justify-center rounded-full font-bold text-xs transition-colors',
                isToday
                  ? 'bg-primary text-primary-foreground shadow-primary/30 shadow-sm'
                  : 'text-foreground/70'
              )}
            >
              {format(day, 'd')}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AllDayRow({ days, events }: { days: Date[]; events: DemoEvent[] }) {
  const multiDayEvents = events.filter((e) => e.isMultiDay);

  if (multiDayEvents.length === 0) return null;

  return (
    <div className="grid grid-cols-[40px_repeat(5,1fr)] border-border/20 border-b bg-muted/5">
      <div className="flex items-center justify-center p-1.5 text-[8px] text-muted-foreground/70 uppercase tracking-wide">
        All
      </div>
      {days.map((_, dayIdx) => {
        const dayEvents = multiDayEvents.filter(
          (e) => dayIdx >= e.startDay && dayIdx <= e.endDay
        );

        return (
          <div
            key={dayIdx}
            className="relative min-h-8 border-border/15 border-l py-1"
          >
            {dayEvents.map((event) => (
              <MultiDayEvent
                key={event.id}
                event={event}
                isStart={dayIdx === event.startDay}
                isEnd={dayIdx === event.endDay}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

// Cell height constant for time grid (36px for compact view)
const CELL_HEIGHT = 36;

function TimeGrid({
  days,
  events,
  hours,
}: {
  days: Date[];
  events: DemoEvent[];
  hours: number[];
}) {
  const timedEvents = events.filter(
    (e) => !e.isMultiDay && e.startHour !== undefined
  );

  // Get current hour for the "now" indicator
  const currentHour = new Date().getHours();
  const currentMinutes = new Date().getMinutes();
  const isWithinHours =
    currentHour >= hours[0]! && currentHour <= hours[hours.length - 1]!;

  return (
    <div className="relative grid grid-cols-[40px_repeat(5,1fr)]">
      {/* Time labels */}
      <div className="relative">
        {hours.map((hour) => (
          <div
            key={hour}
            className="relative border-border/10 border-b"
            style={{ height: `${CELL_HEIGHT}px` }}
          >
            <span
              className={cn(
                'absolute -top-px right-1.5 -translate-y-1/2 font-medium text-[9px]',
                hour === currentHour
                  ? 'text-dynamic-red'
                  : 'text-muted-foreground/70'
              )}
            >
              {format(new Date().setHours(hour, 0), 'h a')}
            </span>
          </div>
        ))}
      </div>

      {/* Day columns */}
      {days.map((day, dayIdx) => {
        const isToday =
          format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

        return (
          <div
            key={dayIdx}
            className={cn(
              'relative border-border/15 border-l',
              isToday && 'bg-primary/5'
            )}
          >
            {/* Hour grid lines */}
            {hours.map((hour) => (
              <div
                key={hour}
                className="border-border/10 border-b"
                style={{ height: `${CELL_HEIGHT}px` }}
              />
            ))}

            {/* Current time indicator (red line) */}
            {isToday && isWithinHours && (
              <div
                className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
                style={{
                  top: `${(currentHour - hours[0]! + currentMinutes / 60) * CELL_HEIGHT}px`,
                }}
              >
                <div className="h-2 w-2 rounded-full bg-dynamic-red shadow-dynamic-red/50 shadow-sm" />
                <div className="h-[2px] flex-1 bg-dynamic-red shadow-dynamic-red/50 shadow-sm" />
              </div>
            )}

            {/* Events for this day */}
            {timedEvents
              .filter((e) => e.startDay === dayIdx)
              .map((event) => {
                const startHour = event.startHour ?? 0;
                const endHour = event.endHour ?? startHour + 1;
                const hourOffset = startHour - hours[0]!;
                const duration = endHour - startHour;
                // Events shorter than 1 hour are considered "small"
                const isSmall = duration < 1;

                return (
                  <TimeSlotEvent
                    key={event.id}
                    event={event}
                    isSmall={isSmall}
                    style={{
                      top: `${hourOffset * CELL_HEIGHT}px`,
                      height: `${Math.max(duration * CELL_HEIGHT - 2, 20)}px`,
                    }}
                  />
                );
              })}
          </div>
        );
      })}
    </div>
  );
}

export function CalendarGridDemo() {
  const t = useTranslations('landing.demo.calendarGrid');

  // Get current week days (Mon-Fri)
  const days = useMemo(() => {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    return Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));
  }, []);

  // Reduced hour range for a more compact view
  const hours = [9, 10, 11, 12, 13, 14, 15, 16];

  const events: DemoEvent[] = [
    // Multi-day event (Team Offsite)
    {
      id: 'multi-1',
      title: t('events.teamOffsite'),
      startDay: 2, // Wednesday
      endDay: 3, // Thursday
      color: 'green',
      isMultiDay: true,
    },
    // Monday events
    {
      id: 'evt-1',
      title: t('events.standup'),
      startDay: 0,
      endDay: 0,
      startHour: 9,
      endHour: 9.75,
      color: 'blue',
    },
    {
      id: 'evt-2',
      title: t('events.focusTime'),
      startDay: 0,
      endDay: 0,
      startHour: 10,
      endHour: 12,
      color: 'purple',
    },
    {
      id: 'evt-mon-pm',
      title: t('events.teamSync'),
      startDay: 0,
      endDay: 0,
      startHour: 14,
      endHour: 15,
      color: 'cyan',
    },
    // Tuesday events
    {
      id: 'evt-4',
      title: t('events.planning'),
      startDay: 1,
      endDay: 1,
      startHour: 10,
      endHour: 11.5,
      color: 'blue',
    },
    {
      id: 'evt-3',
      title: t('events.clientCall'),
      startDay: 1,
      endDay: 1,
      startHour: 14,
      endHour: 15,
      color: 'orange',
    },
    // Wednesday events (with multi-day offsite)
    {
      id: 'evt-wed-am',
      title: t('events.standup'),
      startDay: 2,
      endDay: 2,
      startHour: 9,
      endHour: 9.5,
      color: 'blue',
    },
    // Thursday events (with multi-day offsite)
    {
      id: 'evt-thu-pm',
      title: t('events.review'),
      startDay: 3,
      endDay: 3,
      startHour: 15,
      endHour: 16,
      color: 'cyan',
    },
    // Friday events
    {
      id: 'evt-fri-am',
      title: t('events.standup'),
      startDay: 4,
      endDay: 4,
      startHour: 9,
      endHour: 9.5,
      color: 'blue',
    },
    {
      id: 'evt-6',
      title: t('events.oneOnOne'),
      startDay: 4,
      endDay: 4,
      startHour: 11,
      endHour: 12,
      color: 'green',
    },
    {
      id: 'evt-fri-pm',
      title: t('events.weeklyReview'),
      startDay: 4,
      endDay: 4,
      startHour: 14,
      endHour: 15.5,
      color: 'purple',
    },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-border/30 bg-background/80 shadow-sm backdrop-blur-sm">
      <CalendarHeader days={days} />
      <AllDayRow days={days} events={events} />
      <div className="max-h-[260px] overflow-y-auto">
        <TimeGrid days={days} events={events} hours={hours} />
      </div>
    </div>
  );
}
