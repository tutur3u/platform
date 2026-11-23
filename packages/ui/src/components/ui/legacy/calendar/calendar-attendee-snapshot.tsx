'use client';
import { useQuery } from '@tanstack/react-query';
import type { CalendarSourceOption } from '@tuturuuu/internal-api';
import { getCalendarAttendees } from '@tuturuuu/internal-api/calendar-attendees';
import { Button } from '@tuturuuu/ui/button';
import { LoadingRegion, SkeletonList } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

export function CalendarAttendeeSnapshot({
  wsId,
  eventId,
  source,
}: {
  wsId: string;
  eventId: string;
  source: CalendarSourceOption;
}) {
  const t = useTranslations('calendar.saved_guests');
  const [requested, setRequested] = useState(false);
  const instance = useId();
  const query = useQuery({
    queryKey: [
      'calendar-attendee-snapshot',
      instance,
      wsId,
      eventId,
      source.id,
    ],
    queryFn: () => getCalendarAttendees(wsId, eventId),
    enabled: requested,
    retry: false,
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const snapshot =
    requested &&
    query.isSuccess &&
    !query.isFetching &&
    source.provider !== 'tuturuuu' &&
    query.data.eventId === eventId &&
    query.data.provider === source.provider &&
    query.data.connectionId === source.connectionId &&
    query.data.calendarId === source.externalCalendarId &&
    query.data.attendeeEditing === false
      ? query.data
      : undefined;
  return (
    <section className="space-y-2" aria-label={t('title')}>
      <Button
        type="button"
        variant="outline"
        disabled={query.isFetching}
        onClick={() => {
          if (!requested) setRequested(true);
          else void query.refetch();
        }}
      >
        {t(requested ? 'refresh' : 'view')}
      </Button>
      {requested &&
        (query.isFetching ? (
          <LoadingRegion srLabel={t('loading')} className="space-y-1">
            <SkeletonList
              rows={3}
              withAvatar={false}
              withSubtitle={false}
              rowClassName="px-0"
            />
          </LoadingRegion>
        ) : snapshot ? (
          <>
            <p className="text-muted-foreground text-sm">{t('read_only')}</p>
            {snapshot.attendees.length ? (
              <ul className="space-y-1">
                {snapshot.attendees.map((guest) => (
                  <li key={guest.email}>
                    {guest.name
                      ? `${guest.name} <${guest.email}>`
                      : guest.email}
                  </li>
                ))}
              </ul>
            ) : (
              <p>{t('empty')}</p>
            )}
          </>
        ) : (
          <p role="status" className="text-destructive text-sm">
            {t('unavailable')}
          </p>
        ))}
    </section>
  );
}
