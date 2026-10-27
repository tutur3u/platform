'use client';

import { cn } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type { DraftSession } from './schedule-draft';
import { scheduleMonthCells, scheduleWeekdayHeaders } from './schedule-format';

/**
 * Month overview: sessions per day, with a marker on days that still need a
 * GVNN. Selecting a day jumps the list to it and makes it the default date
 * for "Add session".
 */
export function ScheduleMonthCalendar({
  month,
  onSelectDate,
  rows,
  selectedDate,
}: {
  month: string;
  onSelectDate: (date: string) => void;
  rows: readonly DraftSession[];
  selectedDate: string;
}) {
  const t = useTranslations('ws-topic-announcements');
  const locale = useLocale();
  const cells = useMemo(() => scheduleMonthCells(month), [month]);
  const headers = useMemo(() => scheduleWeekdayHeaders(locale), [locale]);
  const byDate = useMemo(() => {
    const map = new Map<string, { missing: number; total: number }>();
    for (const row of rows) {
      const entry = map.get(row.sessionDate) ?? { missing: 0, total: 0 };
      entry.total += 1;
      if (!row.gvnnContactId && !row.locked) entry.missing += 1;
      map.set(row.sessionDate, entry);
    }
    return map;
  }, [rows]);

  return (
    <div className="rounded-lg border p-3">
      <div className="grid grid-cols-7 gap-1 text-center text-muted-foreground text-xs">
        {headers.map((header, index) => (
          <span className="py-1 font-medium" key={`${header}-${index}`}>
            {header}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, index) => {
          if (!date) return <span key={`pad-${index}`} />;
          const entry = byDate.get(date);
          const selected = date === selectedDate;
          return (
            <button
              aria-label={t('schedule_calendar_day', {
                count: entry?.total ?? 0,
                date,
              })}
              aria-pressed={selected}
              className={cn(
                'relative flex aspect-square flex-col items-center justify-center rounded-md border text-sm tabular-nums transition-colors',
                selected
                  ? 'border-dynamic-blue/50 bg-dynamic-blue/10 text-dynamic-blue'
                  : 'border-transparent hover:bg-foreground/5',
                entry ? 'font-semibold' : 'text-muted-foreground'
              )}
              key={date}
              onClick={() => onSelectDate(date)}
              type="button"
            >
              {Number(date.slice(8))}
              {entry ? (
                <span
                  className={cn(
                    'mt-0.5 h-1.5 w-1.5 rounded-full',
                    entry.missing > 0 ? 'bg-dynamic-orange' : 'bg-dynamic-green'
                  )}
                />
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-3 text-muted-foreground text-xs">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-dynamic-green" />
          {t('schedule_legend_ready')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-dynamic-orange" />
          {t('schedule_needs_gvnn')}
        </span>
      </div>
    </div>
  );
}
