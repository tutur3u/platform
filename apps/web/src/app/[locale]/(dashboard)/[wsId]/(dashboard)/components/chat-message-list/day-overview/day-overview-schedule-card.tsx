'use client';

import { Calendar } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useFormatter, useTranslations } from 'next-intl';
import {
  type DayEventRow,
  type DayGapRow,
  type DayOverview,
  localClock,
} from './parse-day-overview';
import { DayCard, DayCardHeader, DayRowLink } from './day-overview-shell';

function EventRow({ event }: { event: DayEventRow }) {
  const t = useTranslations('dashboard.mira_chat.day_overview');
  const title = event.title ?? t('private_event');
  return (
    <DayRowLink
      href={event.href}
      label={t('open_event', { title })}
      leading={
        <span className="w-24 shrink-0 font-mono text-muted-foreground text-xs tabular-nums sm:w-28">
          {localClock(event.start)} – {localClock(event.end)}
        </span>
      }
    >
      <span className="size-2 shrink-0 rounded-full bg-dynamic-blue" />
      <span className="min-w-0 flex-1 truncate font-semibold">{title}</span>
      {event.location && (
        <span className="hidden max-w-40 truncate text-muted-foreground text-xs sm:inline">
          {event.location}
        </span>
      )}
    </DayRowLink>
  );
}

function GapRow({ gap }: { gap: DayGapRow }) {
  const t = useTranslations('dashboard.mira_chat.day_overview');
  return (
    <li
      className="my-1 flex items-center gap-3 rounded-xl bg-[repeating-linear-gradient(135deg,var(--secondary)_0_8px,transparent_8px_16px)] px-3 py-2 font-semibold text-muted-foreground text-xs"
      data-testid="day-overview-gap"
    >
      <span className="w-24 shrink-0 font-mono tabular-nums sm:w-28">
        {gap.start} – {gap.end}
      </span>
      <span>
        {t('free', {
          duration:
            gap.minutes >= 60
              ? gap.minutes % 60
                ? t('duration_hm', {
                    hours: Math.floor(gap.minutes / 60),
                    minutes: gap.minutes % 60,
                  })
                : t('duration_h', { hours: gap.minutes / 60 })
              : t('duration_m', { minutes: gap.minutes }),
        })}
      </span>
    </li>
  );
}

export function DayOverviewScheduleCard({ day }: { day: DayOverview }) {
  const t = useTranslations('dashboard.mira_chat.day_overview');
  const format = useFormatter();
  const dateLabel = format.dateTime(new Date(`${day.date}T00:00:00Z`), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
  const empty = day.allDay.length === 0 && day.timeline.length === 0;

  return (
    <DayCard>
      <DayCardHeader
        icon={<Calendar className="size-4" />}
        tone="blue"
        title={t('schedule_title')}
        subtitle={dateLabel}
        href={day.calendarHref}
        linkLabel={t('open_calendar')}
      />
      {day.calendarError ? (
        <p className="text-muted-foreground text-sm">
          {t('calendar_unavailable')}
        </p>
      ) : empty ? (
        <p className="text-muted-foreground text-sm">{t('no_events')}</p>
      ) : (
        <>
          {day.allDay.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-2">
              {day.allDay.map((event) => {
                const title = event.title ?? t('private_event');
                const pill = (
                  <>
                    <span className="truncate">{title}</span>
                    <span className="opacity-75">{t('all_day')}</span>
                  </>
                );
                const className =
                  'inline-flex h-7 max-w-full items-center gap-1.5 rounded-full bg-dynamic-blue/15 px-3 font-bold text-dynamic-blue text-xs';
                return (
                  <li key={event.id} className="min-w-0">
                    {event.href ? (
                      <a
                        href={event.href}
                        aria-label={t('open_event', { title })}
                        className={cn(
                          className,
                          'transition-colors hover:bg-dynamic-blue/25 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2'
                        )}
                      >
                        {pill}
                      </a>
                    ) : (
                      <span className={className}>{pill}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <ul className="flex flex-col">
            {day.timeline.map((row) =>
              row.kind === 'gap' ? (
                <GapRow key={`gap-${row.start}`} gap={row} />
              ) : (
                <EventRow key={row.id} event={row} />
              )
            )}
          </ul>
        </>
      )}
    </DayCard>
  );
}
