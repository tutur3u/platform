'use client';

import { CalendarX2, Clock, MapPin, Plus, Search, Sun } from '@tuturuuu/icons';
import type { Workspace } from '@tuturuuu/types';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { useCalendar } from '@tuturuuu/ui/hooks/use-calendar';
import { useCalendarClock } from '@tuturuuu/ui/hooks/use-calendar-clock';
import { useCalendarPreferences } from '@tuturuuu/ui/hooks/use-calendar-preferences';
import { useUserBooleanConfig } from '@tuturuuu/ui/hooks/use-user-config';
import { calendarEventStyle } from '@tuturuuu/utils/calendar-event-colors';
import { isAllDayEvent } from '@tuturuuu/utils/calendar-utils';
import { cn } from '@tuturuuu/utils/format';
import { getTimeFormatPattern } from '@tuturuuu/utils/time-helper';
import { addDays, format, startOfDay } from 'date-fns';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { calendarDayKey, calendarToday } from '../../../../lib/calendar-day';
import {
  formatLunarDay,
  getLunarDate,
  getLunarHolidayName,
  isSpecialLunarDate,
} from '../../../../lib/lunar-calendar';
import { Button } from '../../button';
import { Input } from '../../input';
import { calendarDraftDate } from './calendar-period';
import { useCalendarSettings } from './settings/settings-context';

dayjs.extend(utc);
dayjs.extend(timezone);

interface AgendaViewProps {
  readOnly?: boolean;
  startDate: Date;
  workspace?: Workspace;
  locale?: string;
  daysToShow?: number;
}

interface GroupedEvents {
  date: Date;
  events: CalendarEvent[];
}

function formatTimeWithMidnight(
  date: Date,
  timePattern: string,
  timeFormat: '12h' | '24h',
  zone?: string
): string {
  const zoned = zone && zone !== 'auto' ? dayjs(date).tz(zone) : dayjs(date);
  if (zoned.hour() === 23 && zoned.minute() === 59) {
    return timeFormat === '24h' ? '00:00' : '12:00 am';
  }
  return zoned.format(timePattern);
}

function EventCard({
  event,
  timePattern,
  timeFormat,
  t,
  onOpen,
}: {
  event: CalendarEvent;
  timePattern: string;
  timeFormat: '12h' | '24h';
  t: (key: string) => string;
  onOpen: (id: string) => void;
}) {
  const { settings } = useCalendarSettings();
  const isAllDay = isAllDayEvent(event);

  return (
    <button
      type="button"
      onClick={() => onOpen(event.id)}
      style={calendarEventStyle(event)}
      className={cn(
        'group flex w-full cursor-pointer items-start gap-3 rounded-lg border-l-[3px] px-3 py-2.5 text-left transition-colors hover:brightness-110'
      )}
    >
      {/* Time column */}
      <div className="flex w-16 shrink-0 flex-col pt-0.5 sm:w-20">
        {isAllDay ? (
          <span className="flex items-center gap-1 font-medium text-inherit text-xs">
            <Sun className="h-3 w-3" />
            {t('agenda_all_day')}
          </span>
        ) : (
          <>
            <span className="font-semibold text-inherit text-sm leading-tight">
              {formatTimeWithMidnight(
                new Date(event.start_at),
                timePattern,
                timeFormat,
                settings?.timezone?.timezone
              )}
            </span>
            <span className="text-inherit text-xs">
              {formatTimeWithMidnight(
                new Date(event.end_at),
                timePattern,
                timeFormat,
                settings?.timezone?.timezone
              )}
            </span>
          </>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <span className="line-clamp-1 font-medium text-inherit text-sm leading-tight">
          {event.title || t('views.untitled_event')}
        </span>

        {(event.location || (!isAllDay && event.description)) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
            {!isAllDay && (
              <span className="flex items-center gap-1 text-inherit text-xs">
                <Clock className="h-3 w-3 shrink-0" />
                {(() => {
                  try {
                    const start = new Date(event.start_at);
                    const end = new Date(event.end_at);
                    const diffMs = end.getTime() - start.getTime();
                    const diffMins = Math.round(diffMs / 60000);
                    if (diffMins < 60) return `${diffMins}m`;
                    const h = Math.floor(diffMins / 60);
                    const m = diffMins % 60;
                    return m > 0 ? `${h}h ${m}m` : `${h}h`;
                  } catch {
                    return '';
                  }
                })()}
              </span>
            )}
            {event.location && (
              <span className="flex items-center gap-1 truncate text-inherit text-xs">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{event.location}</span>
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}

function DateHeader({
  date,
  eventCount,
  locale,
  showLunar,
  t,
}: {
  date: Date;
  eventCount: number;
  locale: string;
  showLunar: boolean;
  t: (key: string, values?: Record<string, number>) => string;
}) {
  const { settings } = useCalendarSettings();
  const now = useCalendarClock();
  const todayDate = calendarToday(settings?.timezone?.timezone, now);
  const dateKey = calendarDayKey(date);
  const today = dateKey === calendarDayKey(todayDate);
  const tomorrow = dateKey === calendarDayKey(addDays(todayDate, 1));
  const yesterday = dateKey === calendarDayKey(addDays(todayDate, -1));

  const relativeLabel = today
    ? t('today')
    : tomorrow
      ? t('tomorrow')
      : yesterday
        ? t('yesterday')
        : null;

  const lunar = showLunar ? getLunarDate(date) : null;
  const lunarText = lunar ? formatLunarDay(lunar) : null;
  const isSpecial = lunar ? isSpecialLunarDate(lunar) : false;
  const holidayName = lunar ? getLunarHolidayName(lunar, locale) : null;

  return (
    <div className="sticky top-0 z-10 flex items-center gap-3 bg-background/80 px-1 py-2 backdrop-blur-sm">
      {/* Date number badge */}
      <div
        className={cn(
          'flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl',
          today ? 'bg-primary text-primary-foreground' : 'bg-muted'
        )}
      >
        <span className="font-bold text-lg leading-none">
          {format(date, 'd')}
        </span>
        <span
          className={cn(
            'font-medium text-[9px] uppercase leading-none',
            today ? 'text-primary-foreground/70' : 'text-muted-foreground'
          )}
        >
          {date.toLocaleDateString(locale, { weekday: 'short' })}
        </span>
      </div>

      {/* Date text */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'font-semibold text-sm',
              today ? 'text-primary' : 'text-foreground'
            )}
          >
            {date.toLocaleDateString(locale, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </span>
          {relativeLabel && (
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 font-medium text-[10px]',
                today
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {relativeLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">
            {t('agenda_event_count', { count: eventCount })}
          </span>
          {showLunar && lunarText && (
            <>
              <span className="text-muted-foreground text-xs">·</span>
              <span
                className={cn(
                  'text-xs',
                  isSpecial || holidayName
                    ? 'font-medium text-dynamic-red'
                    : 'text-muted-foreground'
                )}
              >
                {holidayName || lunarText}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export const AgendaView = ({
  startDate,
  readOnly = false,
  locale = 'en',
  daysToShow = 30,
}: AgendaViewProps) => {
  const t = useTranslations('calendar');
  const {
    getCurrentEvents,
    openModal,
    addEmptyEvent,
    readOnly: providerReadOnly,
  } = useCalendar();
  const { settings } = useCalendarSettings();
  const cannotCreate = readOnly || providerReadOnly;
  const createEvent = () => {
    if (cannotCreate) return;
    addEmptyEvent(calendarDraftDate(startDate, settings?.timezone?.timezone));
  };
  const [query, setQuery] = useState('');
  const { timeFormat: rawTimeFormat } = useCalendarPreferences();
  const { value: showLunar } = useUserBooleanConfig(
    'SHOW_LUNAR_CALENDAR',
    locale.startsWith('vi')
  );
  const timeFormat = rawTimeFormat || '12h';
  const timePattern = getTimeFormatPattern(timeFormat);

  const groupedEvents = useMemo(() => {
    const groups: GroupedEvents[] = [];

    for (let i = 0; i < daysToShow; i++) {
      const currentDate = addDays(startOfDay(startDate), i);
      const events = getCurrentEvents(currentDate).filter((event) =>
        `${event.title ?? ''} ${event.location ?? ''}`
          .toLocaleLowerCase(locale)
          .includes(query.toLocaleLowerCase(locale))
      );

      if (events.length > 0) {
        const sortedEvents = [...events].sort((a, b) => {
          const aIsAllDay = isAllDayEvent(a);
          const bIsAllDay = isAllDayEvent(b);
          if (aIsAllDay && !bIsAllDay) return -1;
          if (!aIsAllDay && bIsAllDay) return 1;
          return (
            new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
          );
        });
        groups.push({ date: currentDate, events: sortedEvents });
      }
    }

    return groups;
  }, [startDate, daysToShow, getCurrentEvents, query, locale]);

  const uniqueEvents = new Set(
    groupedEvents.flatMap((group) => group.events.map((event) => event.id))
  ).size;
  return (
    <div
      className="h-full overflow-auto bg-background"
      data-calendar-view="agenda"
    >
      <div className="mx-auto max-w-4xl px-4 py-5 sm:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b pb-5">
          <div className="space-y-1">
            <h2 className="font-semibold text-xl tracking-tight">
              {t('agenda')}
            </h2>
            <p className="text-muted-foreground text-sm tabular-nums">
              {startDate.toLocaleDateString(locale, {
                month: 'short',
                day: 'numeric',
              })}{' '}
              —{' '}
              {addDays(startDate, daysToShow - 1).toLocaleDateString(locale, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
            <p className="text-sm">
              {t('agenda_event_count', { count: uniqueEvents })}
            </p>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <div className="relative flex-1">
              <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
              <Input
                className="pl-9"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('views.search_events')}
                aria-label={t('views.search_events')}
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              aria-label={t('views.create_event')}
              disabled={cannotCreate}
              onClick={createEvent}
            >
              <Plus className="size-4" />
            </Button>
          </div>
        </div>
        {groupedEvents.length ? (
          groupedEvents.map(({ date, events }) => (
            <section key={date.toISOString()} className="relative mb-5">
              <DateHeader
                date={date}
                eventCount={events.length}
                locale={locale}
                showLunar={showLunar}
                t={t}
              />
              <div className="ml-5 space-y-2 border-l pb-2 pl-4 sm:ml-5 sm:pl-8">
                {events.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    timePattern={timePattern}
                    timeFormat={timeFormat}
                    t={t}
                    onOpen={openModal}
                  />
                ))}
              </div>
            </section>
          ))
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
            <CalendarX2 className="size-8 text-muted-foreground" />
            <h3 className="font-semibold">
              {t(query ? 'views.no_matches' : 'agenda_empty_title')}
            </h3>
            {!query && (
              <p className="max-w-sm text-muted-foreground text-sm">
                {t('agenda_empty_subtitle', { days: daysToShow })}
              </p>
            )}
            {query ? (
              <Button variant="outline" onClick={() => setQuery('')}>
                {t('views.clear_search')}
              </Button>
            ) : (
              <Button
                variant="outline"
                disabled={cannotCreate}
                onClick={createEvent}
              >
                {t('views.create_event')}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
