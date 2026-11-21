import { Card } from '@tuturuuu/ui/card';
import type { FleetState } from '../fleet/contract';
import { type ActivityEvent, activity } from '../fleet/model';
import { formatTime, type Translate, useI18n } from '../i18n';
import { Section, SectionMessage } from './section';
import { toneDot } from './tone';

function describe(t: Translate, event: ActivityEvent) {
  switch (event.kind) {
    case 'asked':
      return t('activity.asked', { title: event.title });
    case 'resolved':
      return event.via
        ? t('activity.resolvedVia', {
            title: event.title,
            channel: t(`channel.${event.via}`),
          })
        : t('activity.resolved', { title: event.title });
    case 'lane':
      return t(
        event.state === 'failed'
          ? 'activity.lane.failed'
          : 'activity.lane.waiting',
        {
          title: event.title,
        }
      );
    case 'incident':
      return t('activity.incident', { title: event.title });
    case 'deployed':
      return t('activity.deployed', { sha: event.sha ?? '' }).trim();
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

/** Derived from the snapshot's own timestamps; there is no separate feed. */
export function ActivitySection({ state }: { state: FleetState }) {
  const { t, locale } = useI18n();
  const events = activity(state);
  return (
    <Section id="activity" title={t('nav.activity')}>
      {events.length ? (
        <Card>
          <ul className="divide-y text-sm">
            {events.map((event, index) => (
              <li
                key={`${event.kind}:${event.at}:${index}`}
                className="grid grid-cols-[3rem_0.5rem_minmax(0,1fr)] items-center gap-3 px-4 py-3 md:px-6"
              >
                <time
                  dateTime={event.at}
                  className="font-mono text-muted-foreground text-xs"
                >
                  {formatTime(locale, event.at)}
                </time>
                <span className={toneDot(event.tone)} aria-hidden />
                <span className="break-words">{describe(t, event)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <SectionMessage>{t('activity.empty')}</SectionMessage>
      )}
    </Section>
  );
}
