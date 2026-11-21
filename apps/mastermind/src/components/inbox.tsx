import { Input } from '@tuturuuu/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useState } from 'react';
import type { FleetSnapshot } from '../fleet/contract';
import {
  type InboxItem,
  type InboxTier,
  type InboxView,
  inbox,
  tierOf,
} from '../fleet/model';
import { useSnoozes } from '../fleet/snooze';
import { useI18n } from '../i18n';
import { AskCard } from './ask-card';
import { ResolvedCard } from './resolved-card';
import { Section, SectionMessage } from './section';
import { toneDot } from './tone';

const TIERS: { tier: InboxTier; tone: 'red' | 'orange' | 'gray' }[] = [
  { tier: 'urgent', tone: 'red' },
  { tier: 'decide', tone: 'orange' },
  { tier: 'fyi', tone: 'gray' },
];
const VIEWS: InboxView[] = ['open', 'snoozed', 'answered'];

type Entry = InboxItem & { view: InboxView };

function matches(query: string, title: string) {
  return !query || title.toLowerCase().includes(query.toLowerCase());
}

export function Inbox({
  snapshot,
  now,
  showFyi,
  interactive,
}: {
  snapshot: FleetSnapshot;
  now: number;
  showFyi: boolean;
  interactive: boolean;
}) {
  const { t } = useI18n();
  const snoozes = useSnoozes();
  const [view, setView] = useState<InboxView>('open');
  const [query, setQuery] = useState('');
  const views = inbox(snapshot, snoozes, now);
  const resolved = (snapshot.state.resolved ?? []).filter(
    (decision) => decision.kind !== 'login'
  );
  // Every ask card lives under one keyed parent and the view and search only
  // toggle visibility, so moving between Open, Snoozed and Answered (a snooze
  // ending, Unsnooze) never remounts a card or drops its queued answer.
  const entries: Entry[] = VIEWS.flatMap((name) =>
    views[name].map((item) => ({ ...item, view: name }))
  );
  const shown = (entry: Entry) =>
    entry.view === view &&
    matches(query, entry.decision.title) &&
    (showFyi || view !== 'open' || tierOf(entry.decision) !== 'fyi');
  const shownResolved =
    view === 'answered'
      ? resolved.filter((decision) => matches(query, decision.title))
      : [];
  const empty = !entries.some(shown) && !shownResolved.length;

  return (
    <Section id="inbox" title={t('nav.inbox')}>
      <Tabs
        value={view}
        onValueChange={(value) => setView(value as InboxView)}
        className="gap-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList aria-label={t('nav.inbox')}>
            {VIEWS.map((name) => (
              <TabsTrigger key={name} value={name}>
                {t(`inbox.${name}`)}
                <span className="text-muted-foreground tabular-nums">
                  {name === 'answered'
                    ? views.answered.length + resolved.length
                    : views[name].length}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
          <Input
            type="search"
            className="max-w-64"
            aria-label={t('inbox.search')}
            placeholder={t('inbox.search')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </Tabs>
      <div className="space-y-3">
        {view === 'snoozed' && (
          <p className="text-muted-foreground text-sm">
            {t('inbox.snoozeNote')}
          </p>
        )}
        {empty && <SectionMessage>{t(`inbox.empty.${view}`)}</SectionMessage>}
        <div className="space-y-6">
          {TIERS.map(({ tier, tone }) => {
            const group = entries.filter(
              (entry) => tierOf(entry.decision) === tier
            );
            if (!group.length) return null;
            return (
              <div key={tier} className="space-y-3" hidden={!group.some(shown)}>
                <h3 className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                  <span className={toneDot(tone)} aria-hidden />
                  {t(`tier.${tier}`)}
                </h3>
                {group.map((entry) => (
                  <div key={entry.decision.id} hidden={!shown(entry)}>
                    <AskCard item={entry} now={now} interactive={interactive} />
                  </div>
                ))}
              </div>
            );
          })}
          {shownResolved.map((decision) => (
            <ResolvedCard key={decision.id} decision={decision} />
          ))}
        </div>
      </div>
    </Section>
  );
}
