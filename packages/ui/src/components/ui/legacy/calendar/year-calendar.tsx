'use client';

import { useCalendar } from '@tuturuuu/ui/hooks/use-calendar';
import { useUserBooleanConfig } from '@tuturuuu/ui/hooks/use-user-config';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import {
  eachDayOfInterval,
  endOfMonth,
  getDay,
  isToday,
  startOfMonth,
} from 'date-fns';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import {
  formatLunarDay,
  getLunarDate,
  getLunarHolidayName,
  isSpecialLunarDate,
} from '../../../../lib/lunar-calendar';

interface YearCalendarProps {
  year: number;
  locale: string;
  showWeekends?: boolean;
  firstDayOfWeek?: number;
  onDayClick?: (date: Date) => void;
  onMonthClick?: (date: Date) => void;
}

const normalizeColor = (color: string): string => {
  if (!color) return 'primary';
  const normalized = color.trim().toLowerCase();
  if (normalized === '#6b7280' || normalized === 'grey') return 'gray';
  return normalized;
};

const EVENT_DOT_COLORS: Record<string, string> = {
  blue: 'bg-dynamic-blue',
  red: 'bg-dynamic-red',
  green: 'bg-dynamic-green',
  purple: 'bg-dynamic-purple',
  yellow: 'bg-dynamic-yellow',
  orange: 'bg-dynamic-orange',
  pink: 'bg-dynamic-pink',
  cyan: 'bg-dynamic-cyan',
  indigo: 'bg-dynamic-indigo',
  gray: 'bg-dynamic-gray',
  primary: 'bg-primary',
};

function getEventDotColor(color: string): string {
  const normalized = normalizeColor(color);
  return EVENT_DOT_COLORS[normalized] || 'bg-primary';
}

function getWeekdayLabels(
  firstDayOfWeek: number,
  showWeekends: boolean,
  locale: string
): string[] {
  const days = Array.from({ length: 7 }, (_, day) =>
    new Date(2026, 0, 4 + day).toLocaleDateString(locale, { weekday: 'narrow' })
  );

  const reordered: { label: string; dayIndex: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const idx = (firstDayOfWeek + i) % 7;
    reordered.push({ label: days[idx]!, dayIndex: idx });
  }

  if (!showWeekends) {
    return reordered
      .filter((d) => d.dayIndex !== 0 && d.dayIndex !== 6)
      .map((d) => d.label);
  }

  return reordered.map((d) => d.label);
}

function MiniMonth({
  monthDate,
  locale,
  showLunar,
  showWeekends,
  firstDayOfWeek,
  onDayClick,
  onMonthClick,
}: {
  monthDate: Date;
  locale: string;
  showLunar: boolean;
  showWeekends: boolean;
  firstDayOfWeek: number;
  onDayClick?: (date: Date) => void;
  onMonthClick?: (date: Date) => void;
}) {
  const t = useTranslations('calendar');
  const { getCurrentEvents } = useCalendar();
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const weekdayLabels = useMemo(
    () => getWeekdayLabels(firstDayOfWeek, showWeekends, locale),
    [firstDayOfWeek, showWeekends, locale]
  );

  const numCols = showWeekends ? 7 : 5;

  const gridCells = useMemo(() => {
    const cells: (Date | null)[] = [];

    const firstDay = getDay(monthStart);
    let paddingBefore = firstDay - firstDayOfWeek;
    if (paddingBefore < 0) paddingBefore += 7;

    for (let i = 0; i < paddingBefore; i++) {
      const dayIndex = (firstDayOfWeek + i) % 7;
      if (!showWeekends && (dayIndex === 0 || dayIndex === 6)) continue;
      cells.push(null);
    }

    for (const day of days) {
      const dayOfWeek = getDay(day);
      if (!showWeekends && (dayOfWeek === 0 || dayOfWeek === 6)) continue;
      cells.push(day);
    }

    while (cells.length % numCols !== 0) {
      cells.push(null);
    }

    return cells;
  }, [monthStart, days, firstDayOfWeek, showWeekends, numCols]);

  const isCurrentMonth =
    monthDate.getMonth() === new Date().getMonth() &&
    monthDate.getFullYear() === new Date().getFullYear();

  // Pre-compute event counts for all days in the month to avoid per-cell context calls
  const dayEventData = useMemo(() => {
    const data = new Map<number, { count: number; dots: string[] }>();
    for (const day of days) {
      const events = getCurrentEvents(day);
      if (events.length > 0) {
        const seenColors = new Set<string>();
        const dots: string[] = [];
        for (const event of events) {
          const color = getEventDotColor(event.color || 'primary');
          if (!seenColors.has(color) && dots.length < 3) {
            seenColors.add(color);
            dots.push(color);
          }
        }
        data.set(day.getDate(), { count: events.length, dots });
      }
    }
    return data;
  }, [days, getCurrentEvents]);

  return (
    <section
      className={cn(
        'flex flex-col gap-2 rounded-xl border p-4 transition-colors hover:bg-muted/20',
        isCurrentMonth ? 'border-primary/35 bg-primary/5' : 'bg-background'
      )}
    >
      <button
        type="button"
        onClick={() => onMonthClick?.(monthDate)}
        className={cn(
          'rounded-md px-1 py-1 text-left font-semibold text-sm transition-colors',
          'hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
          isCurrentMonth && 'text-primary'
        )}
      >
        <span>{monthDate.toLocaleDateString(locale, { month: 'long' })}</span>
        <span className="ml-2 font-normal text-muted-foreground text-xs">
          {t('views.busy_days', { count: dayEventData.size })}
        </span>
      </button>

      <div
        className="grid gap-0"
        style={{ gridTemplateColumns: `repeat(${numCols}, 1fr)` }}
      >
        {weekdayLabels.map((label, i) => (
          <div
            key={i}
            className="flex h-5 items-center justify-center text-[10px] text-muted-foreground"
          >
            {label}
          </div>
        ))}
      </div>

      <div
        className="grid gap-0"
        style={{ gridTemplateColumns: `repeat(${numCols}, 1fr)` }}
      >
        {gridCells.map((day, i) => (
          <DayCell
            key={i}
            day={day}
            locale={locale}
            showLunar={showLunar}
            onDayClick={onDayClick}
            dayEventData={day ? dayEventData.get(day.getDate()) : undefined}
          />
        ))}
      </div>
    </section>
  );
}

function DayCell({
  day,
  locale,
  showLunar,
  onDayClick,
  dayEventData,
}: {
  day: Date | null;
  locale: string;
  showLunar: boolean;
  onDayClick?: (date: Date) => void;
  dayEventData?: { count: number; dots: string[] };
}) {
  const t = useTranslations('calendar');
  if (!day) {
    return <div className={cn('h-9', showLunar && 'h-11')} />;
  }

  const today = isToday(day);
  const hasEvents = !!dayEventData && dayEventData.count > 0;
  const eventDots = dayEventData?.dots || [];

  const lunar = showLunar ? getLunarDate(day) : null;
  const lunarText = lunar ? formatLunarDay(lunar) : null;
  const isSpecial = lunar ? isSpecialLunarDate(lunar) : false;
  const holidayName = lunar ? getLunarHolidayName(lunar, locale) : null;

  const cellContent = (
    <button
      type="button"
      onClick={() => onDayClick?.(day)}
      aria-label={`${day.toLocaleDateString(locale, { dateStyle: 'full' })}, ${t('agenda_event_count', { count: dayEventData?.count ?? 0 })}`}
      aria-current={today ? 'date' : undefined}
      className={cn(
        'group relative flex flex-col items-center justify-start rounded-md transition-colors',
        showLunar ? 'h-11 py-1' : 'h-9 py-1',
        'hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
        hasEvents && 'bg-primary/5',
        today && 'font-bold'
      )}
    >
      <span
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded-full text-[11px] leading-none',
          today && 'bg-primary text-primary-foreground',
          !today && 'text-foreground'
        )}
      >
        {day.getDate()}
      </span>

      {showLunar && lunarText && (
        <span
          className={cn(
            'text-[7px] leading-none',
            isSpecial || holidayName
              ? 'font-medium text-dynamic-red'
              : 'text-muted-foreground'
          )}
        >
          {lunarText}
        </span>
      )}

      {hasEvents && !showLunar && (
        <div className="absolute -bottom-0.5 flex gap-px">
          {eventDots.map((color, i) => (
            <div key={i} className={cn('h-1 w-1 rounded-full', color)} />
          ))}
        </div>
      )}

      {hasEvents && showLunar && (
        <div className="absolute top-0 right-0 flex gap-px">
          {eventDots.slice(0, 1).map((color, i) => (
            <div key={i} className={cn('h-1 w-1 rounded-full', color)} />
          ))}
        </div>
      )}
    </button>
  );

  if (holidayName || hasEvents) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{cellContent}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-48 text-xs">
          <div className="space-y-1">
            {holidayName && (
              <div className="font-semibold text-dynamic-red">
                {holidayName}
              </div>
            )}
            {hasEvents && dayEventData && (
              <div className="text-muted-foreground">
                {t('agenda_event_count', { count: dayEventData.count })}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return cellContent;
}

export function YearCalendar({
  year,
  locale,
  showWeekends = true,
  firstDayOfWeek = 1,
  onDayClick,
  onMonthClick,
}: YearCalendarProps) {
  const { value: showLunar } = useUserBooleanConfig(
    'SHOW_LUNAR_CALENDAR',
    locale.startsWith('vi')
  );

  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => new Date(year, i, 1));
  }, [year]);

  return (
    <div
      className="h-full overflow-auto bg-muted/10 p-4 sm:p-6"
      data-calendar-view="year"
    >
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {months.map((monthDate) => (
          <MiniMonth
            key={monthDate.getMonth()}
            monthDate={monthDate}
            locale={locale}
            showLunar={showLunar}
            showWeekends={showWeekends}
            firstDayOfWeek={firstDayOfWeek}
            onDayClick={onDayClick}
            onMonthClick={onMonthClick}
          />
        ))}
      </div>
    </div>
  );
}
