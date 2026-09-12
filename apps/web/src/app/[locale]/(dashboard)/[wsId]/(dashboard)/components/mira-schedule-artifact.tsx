'use client';

import { ArrowUpRight, Clock, MapPin, Video } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { getEventStyles } from '@tuturuuu/utils/color-helper';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import type { ArtifactRow } from './mira-artifact-data';

import { calendarDayRows, dayKey } from './mira-schedule-utils';

export function MiraScheduleArtifact({
  rows,
  meetings = false,
  href,
  startDate,
}: {
  rows: ArtifactRow[];
  meetings?: boolean;
  href?: string;
  startDate?: string;
}) {
  const t = useTranslations('dashboard.mira_workspace');
  const format = useFormatter();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const now = new Date();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const days = Array.from({ length: meetings ? 0 : 7 }, (_, index) => {
    const day = startDate ? new Date(`${startDate}T00:00:00`) : new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() + index);
    return day;
  });
  const sorted = rows
    .filter((row) => row.date && Number.isFinite(new Date(row.date).getTime()))
    .sort((a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime());
  const upcoming = sorted.filter(
    (row) => new Date(row.endDate ?? row.date!) >= now
  );
  const past = sorted
    .filter((row) => new Date(row.endDate ?? row.date!) < now)
    .reverse();
  const calendarRows = meetings ? [] : calendarDayRows(sorted, days);
  const activeDay = days.some((day) => dayKey(day) === selectedDay)
    ? selectedDay
    : null;
  const visible = meetings
    ? showPast
      ? past
      : upcoming
    : calendarRows.filter(
        (row) => !activeDay || dayKey(new Date(row.date!)) === activeDay
      );
  const groups = Map.groupBy(visible, (row) => dayKey(new Date(row.date!)));
  return (
    <div className="space-y-3">
      {meetings ? (
        <div className="flex gap-1 rounded-lg bg-muted/40 p-1">
          {[false, true].map((isPast) => (
            <Button
              key={String(isPast)}
              size="sm"
              variant={showPast === isPast ? 'secondary' : 'ghost'}
              aria-pressed={showPast === isPast}
              className="h-7 flex-1 text-xs"
              onClick={() => setShowPast(isPast)}
            >
              {t(isPast ? 'past_meetings' : 'upcoming')}
              <span className="text-muted-foreground tabular-nums">
                {isPast ? past.length : upcoming.length}
              </span>
            </Button>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-1 rounded-lg border bg-chart-2/5 p-1">
          {days.map((day) => {
            const key = dayKey(day);
            const count = calendarRows.filter(
              (row) => dayKey(new Date(row.date!)) === key
            ).length;
            return (
              <button
                type="button"
                key={key}
                aria-label={`${format.dateTime(day, { dateStyle: 'full', timeZone })}, ${t('event_count', { count })}`}
                aria-pressed={activeDay === key}
                onClick={() => setSelectedDay(activeDay === key ? null : key)}
                className="flex min-w-0 flex-col items-center rounded-lg border border-transparent px-0.5 py-2 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring aria-pressed:border-chart-2 aria-pressed:bg-chart-2/10"
              >
                <span className="text-[10px] text-muted-foreground">
                  {format.dateTime(day, { weekday: 'short', timeZone })}
                </span>
                <span className="mt-1 font-semibold text-sm tabular-nums">
                  {day.getDate()}
                </span>
                <span
                  aria-hidden
                  className={`mt-1.5 size-1 rounded-full ${count ? 'bg-chart-2' : 'bg-muted'}`}
                />
              </button>
            );
          })}
        </div>
      )}
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
        <Clock aria-hidden className="size-3" />
        {t('event_count', {
          count: new Set(visible.map((row) => row.id)).size,
        })}
        {activeDay && !meetings && (
          <button
            type="button"
            className="ml-auto underline underline-offset-4"
            onClick={() => setSelectedDay(null)}
          >
            {t('show_week')}
          </button>
        )}
      </div>
      {visible.length === 0 && (
        <p className="rounded-lg border border-dashed px-3 py-5 text-center text-muted-foreground text-xs">
          {t(
            meetings
              ? showPast
                ? 'no_past_meetings'
                : 'no_upcoming_meetings'
              : 'no_events'
          )}
        </p>
      )}
      {[...groups.entries()].map(([key, events]) => (
        <section key={key} className="space-y-1.5">
          <h3 className="flex items-center gap-2 py-1 font-semibold text-[11px] text-muted-foreground after:h-px after:flex-1 after:bg-border">
            {format.dateTime(new Date(events[0]!.date!), {
              timeZone,
              weekday: 'long',
              month: 'short',
              day: 'numeric',
            })}
          </h3>
          <ul className="space-y-2">
            {events.map((row) => {
              const colors =
                !meetings && row.color ? getEventStyles(row.color) : undefined;
              return (
                <li
                  key={row.id}
                  className={`flex gap-2.5 rounded-lg border p-2.5 transition-colors ${colors ? `${colors.bg} ${colors.border}` : meetings ? 'border-chart-4/20 bg-chart-4/5 hover:bg-chart-4/10' : 'border-chart-2/20 bg-chart-2/5 hover:bg-chart-2/10'}`}
                >
                  <div
                    className={`w-14 shrink-0 rounded-md p-1 text-center font-medium text-[11px] tabular-nums ${colors ? colors.text : meetings ? 'bg-chart-4/10 text-chart-4' : 'bg-chart-2/10 text-chart-2'}`}
                  >
                    <time dateTime={row.date}>
                      {row.allDay
                        ? t('all_day')
                        : format.dateTime(new Date(row.date!), {
                            timeZone,
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                    </time>
                    {row.endDate && !row.allDay && (
                      <p className="mt-0.5 text-muted-foreground">
                        {format.dateTime(new Date(row.endDate), {
                          timeZone,
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    )}
                  </div>
                  <div
                    className={`min-w-0 flex-1 border-l-2 pl-2.5 ${colors ? colors.border : meetings ? 'border-chart-4/40' : 'border-chart-2/40'}`}
                  >
                    <p className="line-clamp-2 font-medium text-sm leading-snug">
                      {meetings && href ? (
                        <a
                          className="flex items-start justify-between gap-2 rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                          href={`${href}/${encodeURIComponent(row.id)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <span>{row.title}</span>
                          <ArrowUpRight
                            aria-hidden
                            className="mt-0.5 size-3 shrink-0 text-chart-4"
                          />
                        </a>
                      ) : (
                        row.title
                      )}
                    </p>
                    {row.detail && (
                      <p className="mt-1 flex items-center gap-1 text-muted-foreground text-xs">
                        <MapPin aria-hidden className="size-3 shrink-0" />
                        <span className="truncate">{row.detail}</span>
                      </p>
                    )}
                    {meetings && (
                      <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Video aria-hidden className="size-3" />
                        {t('meetings')}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
