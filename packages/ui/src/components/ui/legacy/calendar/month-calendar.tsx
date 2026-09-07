'use client';

import { ArrowLeft, Plus } from '@tuturuuu/icons';
import type { Workspace } from '@tuturuuu/types';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { useCalendar } from '@tuturuuu/ui/hooks/use-calendar';
import { useCalendarPreferences } from '@tuturuuu/ui/hooks/use-calendar-preferences';
import { useUserBooleanConfig } from '@tuturuuu/ui/hooks/use-user-config';
import { isAllDayEvent } from '@tuturuuu/utils/calendar-utils';
import { cn } from '@tuturuuu/utils/format';
import { getTimeFormatPattern } from '@tuturuuu/utils/time-helper';
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { formatLunarDay, getLunarDate } from '../../../../lib/lunar-calendar';
import { Button } from '../../button';
import { Popover, PopoverContent, PopoverTrigger } from '../../popover';
import { calendarEventTone } from './calendar-event-tone';
import { useCalendarSettings } from './settings/settings-context';

dayjs.extend(utc);
dayjs.extend(timezone);
interface MonthCalendarProps {
  date: Date;
  readOnly?: boolean;
  workspace?: Workspace;
  visibleDates?: Date[];
  viewedMonth?: Date;
  locale?: string;
  onDayClick?: (date: Date) => void;
}

function MonthEvent({
  event,
  day,
  timePattern,
  zone,
  onOpen,
}: {
  event: CalendarEvent;
  day: Date;
  timePattern: string;
  zone?: string;
  onOpen: (id: string) => void;
}) {
  const t = useTranslations('calendar');
  const title = event.title || t('views.untitled_event');
  const allDay = isAllDayEvent(event);
  const continued = new Date(event.start_at) < startOfDay(day);
  return (
    <button
      type="button"
      onClick={() => onOpen(event.id)}
      title={title}
      className={cn(
        'flex w-full min-w-0 items-center gap-1 rounded px-1 py-1 text-left text-[10px] leading-tight transition-colors hover:brightness-110 focus-visible:outline-2 focus-visible:outline-ring sm:px-1.5 sm:text-xs',
        calendarEventTone(event.color),
        allDay && 'font-medium'
      )}
    >
      {continued ? (
        <ArrowLeft className="size-2.5 shrink-0" />
      ) : (
        !allDay && (
          <span className="hidden shrink-0 tabular-nums opacity-70 lg:inline">
            {(zone && zone !== 'auto'
              ? dayjs(event.start_at).tz(zone)
              : dayjs(event.start_at)
            ).format(timePattern)}
          </span>
        )
      )}
      <span className="truncate">{title}</span>
    </button>
  );
}

export function MonthCalendar({
  date,
  readOnly = false,
  viewedMonth = date,
  visibleDates,
  locale = 'en',
  onDayClick,
}: MonthCalendarProps) {
  const t = useTranslations('calendar');
  const {
    getCurrentEvents,
    addEmptyEvent,
    openModal,
    readOnly: providerReadOnly,
  } = useCalendar();
  const cannotCreate = readOnly || providerReadOnly;
  const { settings } = useCalendarSettings();
  const { timeFormat, weekStartsOn } = useCalendarPreferences();
  const { value: showLunar } = useUserBooleanConfig(
    'SHOW_LUNAR_CALENDAR',
    locale.startsWith('vi')
  );
  const timePattern = getTimeFormatPattern(timeFormat);
  const firstDay = (visibleDates?.[0]?.getDay() ?? weekStartsOn) as
    | 0
    | 1
    | 2
    | 3
    | 4
    | 5
    | 6;
  const days = useMemo(
    () =>
      visibleDates?.length
        ? visibleDates
        : eachDayOfInterval({
            start: startOfWeek(startOfMonth(viewedMonth), {
              weekStartsOn: firstDay,
            }),
            end: endOfWeek(endOfMonth(viewedMonth), { weekStartsOn: firstDay }),
          }),
    [visibleDates, viewedMonth, firstDay]
  );
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    addDays(days[0]!, index)
  );
  const showWeekends = settings?.appearance?.showWeekends !== false;
  const visibleDays = days.filter(
    (day) => showWeekends || ![0, 6].includes(day.getDay())
  );
  const columns = showWeekends ? 7 : 5;
  const rows = Math.ceil(visibleDays.length / columns);
  const addEvent = (day: Date) => {
    if (cannotCreate) return;
    const zone = settings?.timezone?.timezone;
    const wallTime = `${dayjs(day).format('YYYY-MM-DD')}T09:00:00`;
    addEmptyEvent(
      (zone && zone !== 'auto'
        ? dayjs.tz(wallTime, zone)
        : dayjs(wallTime)
      ).toDate()
    );
  };
  return (
    <div
      className="flex h-full min-h-0 flex-col bg-background"
      data-calendar-view="month"
    >
      <div
        className="grid shrink-0 border-b bg-muted/30"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {weekdays
          .filter((day) => showWeekends || ![0, 6].includes(day.getDay()))
          .map((day) => (
            <div
              key={day.getDay()}
              className="px-2 py-3 text-center font-medium text-muted-foreground text-xs"
            >
              {day.toLocaleDateString(locale, { weekday: 'short' })}
            </div>
          ))}
      </div>
      <div
        className="grid min-h-0 flex-1 overflow-auto"
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(112px, 1fr))`,
        }}
      >
        {visibleDays.map((day) => {
          const events = [...getCurrentEvents(day)].sort(
            (a, b) =>
              Number(isAllDayEvent(b)) - Number(isAllDayEvent(a)) ||
              +new Date(a.start_at) - +new Date(b.start_at)
          );
          const currentMonth = isSameMonth(day, viewedMonth);
          const label = day.toLocaleDateString(locale, { dateStyle: 'full' });
          return (
            <section
              key={day.toISOString()}
              aria-label={label}
              className={cn(
                'group min-w-0 border-r border-b p-1 sm:p-2',
                !currentMonth && 'bg-muted/35 text-muted-foreground',
                isToday(day) && 'bg-primary/5'
              )}
            >
              <div className="mb-1 flex min-h-7 items-center justify-between gap-1">
                <button
                  type="button"
                  aria-label={label}
                  aria-current={isToday(day) ? 'date' : undefined}
                  onClick={() => onDayClick?.(day)}
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full font-medium text-xs tabular-nums hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
                    isToday(day) &&
                      'bg-primary text-primary-foreground hover:bg-primary/90'
                  )}
                >
                  {day.getDate()}
                </button>
                {showLunar && (
                  <span className="hidden text-[10px] text-muted-foreground sm:inline">
                    {formatLunarDay(getLunarDate(day))}
                  </span>
                )}
                <button
                  type="button"
                  disabled={cannotCreate}
                  aria-label={t('views.create_on_date', { date: label })}
                  onClick={() => addEvent(day)}
                  className="hidden size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent focus-visible:opacity-100 sm:flex sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                >
                  <Plus className="size-3" />
                </button>
              </div>
              <div className="space-y-1">
                {events.slice(0, 3).map((event) => (
                  <MonthEvent
                    key={event.id}
                    event={event}
                    day={day}
                    timePattern={timePattern}
                    zone={settings?.timezone?.timezone}
                    onOpen={openModal}
                  />
                ))}
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="mt-1 w-full rounded px-1 py-1 text-left text-[10px] text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring sm:text-xs"
                    aria-label={t('views.open_day', { date: label })}
                  >
                    {events.length > 3
                      ? t('views.more_events', { count: events.length - 3 })
                      : t('views.open_day_short')}
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  className="max-h-[70dvh] w-80 max-w-[calc(100vw-2rem)] space-y-3 overflow-auto"
                  align="start"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-sm">{label}</h3>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={cannotCreate}
                      aria-label={t('views.create_on_date', { date: label })}
                      onClick={() => addEvent(day)}
                    >
                      <Plus className="size-4" />
                    </Button>
                  </div>
                  {events.length ? (
                    events.map((event) => (
                      <MonthEvent
                        key={event.id}
                        event={event}
                        day={day}
                        timePattern={timePattern}
                        zone={settings?.timezone?.timezone}
                        onOpen={openModal}
                      />
                    ))
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      {t('views.no_events')}
                    </p>
                  )}
                </PopoverContent>
              </Popover>
            </section>
          );
        })}
      </div>
    </div>
  );
}
