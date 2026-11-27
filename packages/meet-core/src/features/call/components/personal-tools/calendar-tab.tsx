'use client';

import { useFormatter, useTranslations } from 'next-intl';
import type { PersonalToolsSnapshot } from '../../lib/personal-tools';
import { PersonalAppLinkButton, resolveSafePersonalAppUrl } from './shared';

type CalendarEvent = NonNullable<PersonalToolsSnapshot['events']>[number];

export function PersonalCalendarTab({ data }: { data: PersonalToolsSnapshot }) {
  const t = useTranslations('meet.call.private_tools');
  const format = useFormatter();
  const href = resolveSafePersonalAppUrl('calendar', data.workspace);

  return (
    <div>
      <PersonalAppLinkButton href={href} label={t('open_calendar')} />
      {data.calendarStatus === 'stale' && (
        <p role="status" className="mb-2 text-muted-foreground text-xs">
          {t('stale_calendar')}
        </p>
      )}
      {!data.events ? (
        <p role="status" className="text-muted-foreground text-sm">
          {t('tab_unavailable')}
        </p>
      ) : !data.events.length ? (
        <p className="text-muted-foreground text-sm">{t('empty_calendar')}</p>
      ) : (
        <ul className="space-y-1">
          {data.events.map((event: CalendarEvent) => (
            <li key={event.id} className="rounded-lg px-2 py-2.5">
              <p className="break-words text-sm">
                {event.is_encrypted
                  ? t('protected_event')
                  : event.title || t('event')}
              </p>
              <p className="mt-1 text-muted-foreground text-xs">
                {format.dateTime(new Date(event.start_at), {
                  weekday: 'short',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
