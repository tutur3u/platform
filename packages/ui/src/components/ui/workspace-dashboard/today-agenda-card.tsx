'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Plus } from '@tuturuuu/icons/lucide';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { getEventStyles } from '@tuturuuu/utils/color-helper';
import { cn } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import { Fragment } from 'react';
import { DashboardCard } from './dashboard-card';
import {
  DashboardCardEmpty,
  DashboardCardError,
  DashboardRowsSkeleton,
} from './dashboard-card-states';
import {
  eventHref,
  eventsForToday,
  newEventHref,
  nowMarkerIndex,
} from './dashboard-model';
import { dashboardAgendaQuery } from './dashboard-queries';
import { formatClockTime, useNow } from './use-now';

interface TodayAgendaCardProps {
  wsId: string;
  /** Calendar app destination for the header link. */
  calendarHref: string;
}

const headerLink =
  'inline-flex items-center gap-0.5 whitespace-nowrap rounded-md px-1 text-muted-foreground text-xs hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring';

export function TodayAgendaCard({ wsId, calendarHref }: TodayAgendaCardProps) {
  const t = useTranslations('dashboard.overview');
  const locale = useLocale();
  const now = useNow();
  const query = useQuery(dashboardAgendaQuery(wsId, now));
  const events = query.data ? eventsForToday(query.data, now) : [];

  return (
    <DashboardCard
      id="agenda"
      title={t('agenda_title')}
      meta={
        query.status === 'success'
          ? t('events_count', { count: events.length })
          : null
      }
      actions={
        <>
          <a
            href={newEventHref(calendarHref)}
            aria-label={t('new_event')}
            title={t('new_event')}
            className={`${headerLink} size-7 justify-center px-0`}
          >
            <Plus aria-hidden className="size-4" />
          </a>
          <a href={calendarHref} className={headerLink}>
            {t('calendar')}
            <ChevronRight aria-hidden className="size-3.5" />
          </a>
        </>
      }
    >
      {query.status === 'pending' ? (
        <DashboardRowsSkeleton rows={3} label={t('loading')} />
      ) : query.status === 'error' ? (
        <DashboardCardError
          message={t('agenda_error')}
          retryLabel={t('retry')}
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      ) : events.length === 0 ? (
        <DashboardCardEmpty
          action={
            <a href={newEventHref(calendarHref)} className={`${headerLink} px-0`}>
              <Plus aria-hidden className="size-3.5" />
              {t('new_event')}
            </a>
          }
        >
          {t('no_events_today')}
        </DashboardCardEmpty>
      ) : (
        <AgendaList
          calendarHref={calendarHref}
          events={events}
          marker={nowMarkerIndex(events, now)}
          nowLabel={formatClockTime(locale, now.toISOString())}
        />
      )}
    </DashboardCard>
  );
}

function AgendaList({
  calendarHref,
  events,
  marker,
  nowLabel,
}: {
  calendarHref: string;
  events: CalendarEvent[];
  marker: number;
  nowLabel: string;
}) {
  const t = useTranslations('dashboard.overview');
  const locale = useLocale();
  const nowLine = (
    <li
      aria-label={t('now_marker', { time: nowLabel })}
      className="flex items-center gap-2 py-0.5 text-dynamic-red text-xs after:h-px after:flex-1 after:bg-dynamic-red/60"
    >
      <span aria-hidden>{nowLabel}</span>
    </li>
  );

  return (
    <ul className="grid min-w-0 gap-1">
      {events.map((event, index) => (
        <Fragment key={event.id}>
          {index === marker ? nowLine : null}
          <li className="flex min-w-0 items-stretch gap-3 py-1 text-sm">
            <span className="w-12 shrink-0 pt-0.5 text-muted-foreground text-xs tabular-nums">
              {event.is_all_day
                ? t('all_day')
                : formatClockTime(locale, event.start_at)}
            </span>
            <span
              className={cn(
                'min-w-0 flex-1 border-l-[3px] pl-2.5',
                getEventStyles(event.color ?? 'BLUE').border
              )}
            >
              <a
                href={eventHref(calendarHref, event.id)}
                className="block truncate rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                title={event.title}
              >
                {event.title || t('untitled_event')}
              </a>
              {event.location ? (
                <span className="block truncate text-muted-foreground text-xs">
                  {event.location}
                </span>
              ) : null}
            </span>
          </li>
        </Fragment>
      ))}
      {marker === events.length ? nowLine : null}
    </ul>
  );
}
