'use client';

import { Sparkles } from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';
import { addDays, format, startOfWeek } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { motion, useReducedMotion } from 'framer-motion';
import { useMemo } from 'react';
import {
  type DemoEvent,
  type EventColor,
  GRID_HOURS,
  HOUR_HEIGHT,
  useCalendarEvents,
} from './calendar-grid-data';
import { DemoLabel } from './demo-chrome';

const GRID_COLUMNS = 'grid grid-cols-[2.75rem_repeat(5,minmax(0,1fr))]';

const eventTones: Record<EventColor, string> = {
  blue: 'border-l-dynamic-blue bg-dynamic-blue/10 text-dynamic-blue hover:bg-dynamic-blue/15',
  green:
    'border-l-dynamic-green bg-dynamic-green/10 text-dynamic-green hover:bg-dynamic-green/15',
  purple:
    'border-l-dynamic-purple bg-dynamic-purple/10 text-dynamic-purple hover:bg-dynamic-purple/15',
  orange:
    'border-l-dynamic-orange bg-dynamic-orange/10 text-dynamic-orange hover:bg-dynamic-orange/15',
  cyan: 'border-l-dynamic-cyan bg-dynamic-cyan/10 text-dynamic-cyan hover:bg-dynamic-cyan/15',
};

const multiDayTones: Record<EventColor, string> = {
  blue: 'bg-dynamic-blue/12 text-dynamic-blue',
  green: 'bg-dynamic-green/12 text-dynamic-green',
  purple: 'bg-dynamic-purple/12 text-dynamic-purple',
  orange: 'bg-dynamic-orange/12 text-dynamic-orange',
  cyan: 'bg-dynamic-cyan/12 text-dynamic-cyan',
};

function formatHour(hour: number) {
  const base = new Date();
  base.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
  return format(base, 'HH:mm');
}

function WeekHeader({
  days,
  todayIndex,
}: {
  days: Date[];
  todayIndex: number;
}) {
  return (
    <div
      className={cn(
        GRID_COLUMNS,
        'border-foreground/[0.06] border-b bg-foreground/[0.015]'
      )}
    >
      <div />
      {days.map((day, index) => {
        const isToday = index === todayIndex;

        return (
          <div
            className={cn(
              'border-foreground/[0.05] border-l px-2 py-2 text-center',
              isToday && 'bg-dynamic-blue/[0.06]'
            )}
            key={day.toISOString()}
          >
            <DemoLabel
              className={cn(
                isToday ? 'text-dynamic-blue' : 'text-foreground/30'
              )}
            >
              {format(day, 'EEE', { locale: enUS })}
            </DemoLabel>
            <div
              className={cn(
                'mt-1.5 font-mono-ui text-[0.72rem] tabular-nums',
                isToday ? 'text-dynamic-blue' : 'text-foreground/45'
              )}
            >
              {format(day, 'dd')}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AllDayRow({ days, events }: { days: Date[]; events: DemoEvent[] }) {
  const multiDay = events.filter((event) => event.isMultiDay);
  if (multiDay.length === 0) return null;

  return (
    <div
      className={cn(GRID_COLUMNS, 'border-foreground/[0.06] border-b py-1.5')}
    >
      <div className="flex items-center justify-end pr-2">
        <DemoLabel className="text-foreground/25">24h</DemoLabel>
      </div>
      {days.map((day, dayIndex) => (
        <div
          className="relative border-foreground/[0.05] border-l"
          key={day.toISOString()}
        >
          {multiDay
            .filter(
              (event) => dayIndex >= event.startDay && dayIndex <= event.endDay
            )
            .map((event) => {
              const isStart = dayIndex === event.startDay;
              const isEnd = dayIndex === event.endDay;

              return (
                <div
                  className={cn(
                    'flex h-5 items-center overflow-hidden',
                    multiDayTones[event.color],
                    isStart && 'ml-1 rounded-l-md pl-2',
                    isEnd && 'mr-1 rounded-r-md'
                  )}
                  key={event.id}
                >
                  {isStart ? (
                    <DemoLabel className="truncate">{event.title}</DemoLabel>
                  ) : null}
                </div>
              );
            })}
        </div>
      ))}
    </div>
  );
}

function EventBlock({ event, index }: { event: DemoEvent; index: number }) {
  const reduced = useReducedMotion();
  const startHour = event.startHour ?? 0;
  const endHour = event.endHour ?? startHour + 1;
  const duration = endHour - startHour;
  const height = Math.max(duration * HOUR_HEIGHT - 3, 18);
  const isCompact = height < 34;

  return (
    <motion.div
      animate={{ opacity: 1, scaleY: 1 }}
      className={cn(
        'absolute inset-x-1 origin-top cursor-default overflow-hidden rounded-md border-l-2 px-1.5 transition-colors duration-300',
        isCompact ? 'flex items-center' : 'py-1',
        eventTones[event.color]
      )}
      initial={{ opacity: 0, scaleY: reduced ? 1 : 0.7 }}
      style={{
        top: `${(startHour - GRID_HOURS[0]!) * HOUR_HEIGHT}px`,
        height: `${height}px`,
      }}
      transition={{
        duration: reduced ? 0.15 : 0.45,
        delay: reduced ? 0 : 0.1 + index * 0.04,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          {event.autoScheduled ? (
            <Sparkles className="h-2.5 w-2.5 shrink-0 opacity-70" />
          ) : null}
          <span className="truncate font-medium text-[0.68rem] leading-tight">
            {event.title}
          </span>
        </div>
        {isCompact ? null : (
          <div className="mt-0.5 font-mono-ui text-[0.58rem] tabular-nums opacity-60">
            {formatHour(startHour)}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function NowLine({ hour, minute }: { hour: number; minute: number }) {
  const top = (hour - GRID_HOURS[0]! + minute / 60) * HOUR_HEIGHT;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
      style={{ top: `${top}px` }}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span
          aria-hidden
          className="absolute inset-0 animate-ring-pulse rounded-full bg-dynamic-red motion-reduce:animate-none"
        />
        <span className="relative h-1.5 w-1.5 rounded-full bg-dynamic-red" />
      </span>
      <span className="h-px flex-1 bg-gradient-to-r from-dynamic-red to-dynamic-red/25" />
    </div>
  );
}

/**
 * Compact work-week grid: five days, an eight-hour band, and the live "now"
 * line. Blocks flown in on entrance so switching to the calendar tab reads as
 * the schedule resolving rather than a static screenshot.
 */
export function CalendarGridDemo() {
  const events = useCalendarEvents();

  const { days, todayIndex, now } = useMemo(() => {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const current = new Date();
    const week = Array.from({ length: 5 }, (_, index) =>
      addDays(weekStart, index)
    );
    const todayKey = format(current, 'yyyy-MM-dd');

    return {
      days: week,
      todayIndex: week.findIndex(
        (day) => format(day, 'yyyy-MM-dd') === todayKey
      ),
      now: { hour: current.getHours(), minute: current.getMinutes() },
    };
  }, []);

  const firstHour = GRID_HOURS[0]!;
  const lastHour = GRID_HOURS[GRID_HOURS.length - 1]!;
  const showNow = now.hour >= firstHour && now.hour <= lastHour;
  const timed = events.filter((event) => !event.isMultiDay);

  return (
    <div>
      <WeekHeader days={days} todayIndex={todayIndex} />
      <AllDayRow days={days} events={events} />

      <div className="max-h-[268px] overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className={cn(GRID_COLUMNS, 'relative')}>
          <div>
            {GRID_HOURS.map((hour) => (
              <div
                className="relative"
                key={hour}
                style={{ height: `${HOUR_HEIGHT}px` }}
              >
                <span className="absolute top-0 right-2 -translate-y-1/2 font-mono-ui text-[0.58rem] text-foreground/25 tabular-nums">
                  {formatHour(hour)}
                </span>
              </div>
            ))}
          </div>

          {days.map((day, dayIndex) => {
            const isToday = dayIndex === todayIndex;

            return (
              <div
                className={cn(
                  'relative border-foreground/[0.05] border-l',
                  isToday && 'bg-dynamic-blue/[0.04]'
                )}
                key={day.toISOString()}
              >
                {GRID_HOURS.map((hour) => (
                  <div
                    className="border-foreground/[0.05] border-b"
                    key={hour}
                    style={{ height: `${HOUR_HEIGHT}px` }}
                  />
                ))}

                {isToday && showNow ? (
                  <NowLine hour={now.hour} minute={now.minute} />
                ) : null}

                {timed
                  .filter((event) => event.startDay === dayIndex)
                  .map((event, index) => (
                    <EventBlock
                      event={event}
                      index={dayIndex + index}
                      key={event.id}
                    />
                  ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
