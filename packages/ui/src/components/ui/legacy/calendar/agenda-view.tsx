'use client';

import { CalendarX2, Clock, MapPin, Sun } from '@tuturuuu/icons';
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
  format,
  isToday,
  isTomorrow,
  isYesterday,
  startOfDay,
} from 'date-fns';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import {
  formatLunarDay,
  getLunarDate,
  getLunarHolidayName,
  isSpecialLunarDate,
} from '../../../../lib/lunar-calendar';

interface AgendaViewProps {
  startDate: Date;
  workspace?: Workspace;
  locale?: string;
  daysToShow?: number;
}

interface GroupedEvents {
  date: Date;
  events: CalendarEvent[];
}

const COLOR_MAP: Record<
  string,
  { accent: string; bg: string; border: string }
> = {
  blue: {
    accent: 'bg-dynamic-blue',
    bg: 'bg-dynamic-blue/5 hover:bg-dynamic-blue/10',
    border: 'border-l-dynamic-blue',
  },
  red: {
    accent: 'bg-dynamic-red',
    bg: 'bg-dynamic-red/5 hover:bg-dynamic-red/10',
    border: 'border-l-dynamic-red',
  },
  green: {
    accent: 'bg-dynamic-green',
    bg: 'bg-dynamic-green/5 hover:bg-dynamic-green/10',
    border: 'border-l-dynamic-green',
  },
  purple: {
    accent: 'bg-dynamic-purple',
    bg: 'bg-dynamic-purple/5 hover:bg-dynamic-purple/10',
    border: 'border-l-dynamic-purple',
  },
  yellow: {
    accent: 'bg-dynamic-yellow',
    bg: 'bg-dynamic-yellow/5 hover:bg-dynamic-yellow/10',
    border: 'border-l-dynamic-yellow',
  },
  orange: {
    accent: 'bg-dynamic-orange',
    bg: 'bg-dynamic-orange/5 hover:bg-dynamic-orange/10',
    border: 'border-l-dynamic-orange',
  },
  pink: {
    accent: 'bg-dynamic-pink',
    bg: 'bg-dynamic-pink/5 hover:bg-dynamic-pink/10',
    border: 'border-l-dynamic-pink',
  },
  cyan: {
    accent: 'bg-dynamic-cyan',
    bg: 'bg-dynamic-cyan/5 hover:bg-dynamic-cyan/10',
    border: 'border-l-dynamic-cyan',
  },
  indigo: {
    accent: 'bg-dynamic-indigo',
    bg: 'bg-dynamic-indigo/5 hover:bg-dynamic-indigo/10',
    border: 'border-l-dynamic-indigo',
  },
  gray: {
    accent: 'bg-dynamic-gray',
    bg: 'bg-dynamic-gray/5 hover:bg-dynamic-gray/10',
    border: 'border-l-dynamic-gray',
  },
};

function normalizeColor(color: string): string {
  if (!color) return 'blue';
  const normalized = color.trim().toLowerCase();
  if (normalized === '#6b7280' || normalized === 'grey') return 'gray';
  return normalized;
}

function getStyles(event: CalendarEvent) {
  const key = normalizeColor(event.color || 'blue');
  return COLOR_MAP[key] || COLOR_MAP.blue!;
}

function formatTimeWithMidnight(
  date: Date,
  timePattern: string,
  timeFormat: '12h' | '24h'
): string {
  if (date.getHours() === 23 && date.getMinutes() === 59) {
    return timeFormat === '24h' ? '00:00' : '12:00 am';
  }
  return format(date, timePattern);
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
  const isAllDay = isAllDayEvent(event);
  const styles = getStyles(event);

  return (
    <button
      type="button"
      onClick={() => onOpen(event.id)}
      className={cn(
        'group flex w-full cursor-pointer items-start gap-3 rounded-lg border-l-[3px] px-3 py-2.5 text-left transition-colors',
        styles.border,
        styles.bg
      )}
    >
      {/* Time column */}
      <div className="flex w-16 shrink-0 flex-col pt-0.5 sm:w-20">
        {isAllDay ? (
          <span className="flex items-center gap-1 font-medium text-muted-foreground text-xs">
            <Sun className="h-3 w-3" />
            {t('agenda_all_day')}
          </span>
        ) : (
          <>
            <span className="font-semibold text-foreground text-sm leading-tight">
              {formatTimeWithMidnight(
                new Date(event.start_at),
                timePattern,
                timeFormat
              )}
            </span>
            <span className="text-muted-foreground text-xs">
              {formatTimeWithMidnight(
                new Date(event.end_at),
                timePattern,
                timeFormat
              )}
            </span>
          </>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <span className="line-clamp-1 font-medium text-foreground text-sm leading-tight">
          {event.title || 'Untitled event'}
        </span>

        {(event.location || (!isAllDay && event.description)) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
            {!isAllDay && (
              <span className="flex items-center gap-1 text-muted-foreground text-xs">
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
              <span className="flex items-center gap-1 truncate text-muted-foreground text-xs">
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
  const today = isToday(date);
  const tomorrow = isTomorrow(date);
  const yesterday = isYesterday(date);

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
          {format(date, 'EEE')}
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
            {format(date, 'EEEE, MMMM d')}
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
  locale = 'en',
  daysToShow = 30,
}: AgendaViewProps) => {
  const t = useTranslations('calendar');
  const { getCurrentEvents, openModal } = useCalendar();
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
      const events = getCurrentEvents(currentDate);

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
  }, [startDate, daysToShow, getCurrentEvents]);

  if (groupedEvents.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <CalendarX2 className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="mb-1 font-semibold text-lg">
          {t('agenda_empty_title')}
        </h3>
        <p className="max-w-xs text-muted-foreground text-sm">
          {t('agenda_empty_subtitle', { days: daysToShow })}
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-2xl space-y-1 p-4">
        {groupedEvents.map(({ date, events }) => (
          <div key={date.toISOString()}>
            <DateHeader
              date={date}
              eventCount={events.length}
              locale={locale}
              showLunar={showLunar}
              t={t as any}
            />
            <div className="space-y-1 pb-4 pl-14">
              {events.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  timePattern={timePattern}
                  timeFormat={timeFormat}
                  t={t as any}
                  onOpen={openModal}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
