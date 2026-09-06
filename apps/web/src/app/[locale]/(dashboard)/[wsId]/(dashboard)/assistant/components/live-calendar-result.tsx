'use client';

import { CalendarDays } from '@tuturuuu/icons';
import { useLocale, useTranslations } from 'next-intl';

export function LiveCalendarResult({
  result,
}: {
  result: Record<string, unknown> | null;
}) {
  const t = useTranslations('dashboard.voice_assistant.studio');
  const locale = useLocale();
  if (!result) return null;
  const events = Array.isArray(result.events) ? result.events : [];
  const formatDate = (date: unknown) =>
    typeof date === 'string' && Number.isFinite(Date.parse(date))
      ? new Date(date).toLocaleString(locale, {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : '';
  return (
    <section className="rounded-xl border bg-background p-4">
      <h3 className="mb-3 flex items-center gap-2 font-medium text-sm">
        <CalendarDays className="size-4 text-primary" />
        {t('calendar')}
      </h3>
      {!events.length && (
        <p className="text-muted-foreground text-sm">{t('calendar_empty')}</p>
      )}
      <ol className="space-y-3">
        {events.map((event, index) => {
          if (!event || typeof event !== 'object') return null;
          return (
            <li
              key={typeof event.id === 'string' ? event.id : index}
              className="border-primary/30 border-l-2 pl-3 text-sm"
            >
              <p className="font-medium">
                {typeof event.title === 'string' ? event.title : t('calendar')}
              </p>
              <p className="mt-1 text-muted-foreground text-xs">
                {formatDate(event.start_at)} — {formatDate(event.end_at)}
              </p>
              {typeof event.location === 'string' && (
                <p className="mt-1 text-muted-foreground text-xs">
                  {event.location}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {result.truncated === true && (
        <p className="mt-3 text-muted-foreground text-xs">
          {t('calendar_truncated')}
        </p>
      )}
    </section>
  );
}
