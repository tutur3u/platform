import { Badge } from '@tuturuuu/ui/badge';
import { Link } from '@tanstack/react-router';
import { ChevronDown, ChevronRight, Folder } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useRef, useState } from 'react';
import type { FleetSnapshot } from '../fleet/contract';
import { inboxLanes, type NeedsItem } from '../fleet/inbox-lanes';
import { useSnoozes } from '../fleet/snooze';
import { localeParam, useI18n } from '../i18n';
import { AskCard } from './ask-card';
import { FyiPanel, RecentAnswers } from './inbox-side';
import { Kbd, onListKey, visibleCards } from './inbox-keys';
import { LoginCard } from './login-card';
import { ReviewCard } from './review-card';
import { Section, SectionMessage } from './section';

export function Inbox({
  snapshot,
  now,
  showFyi,
  interactive,
}: {
  snapshot: FleetSnapshot;
  now: number;
  /** Off hides open FYI asks; closed decisions still show. */
  showFyi: boolean;
  interactive: boolean;
}) {
  const { t, locale } = useI18n();
  const lanes = inboxLanes(snapshot, useSnoozes(), now);
  const list = useRef<HTMLDivElement>(null);
  const [showSnoozed, setShowSnoozed] = useState(false);
  const label = (id?: string) =>
    snapshot.state.machines.find((m) => m.id === id)?.label ?? id;
  // After the answered card re-renders, so its Undo never keeps focus.
  const focusNext = (id: string) => () =>
    setTimeout(() => {
      const cards = visibleCards(list.current);
      const from = cards.findIndex(
        (card) => card.closest<HTMLElement>('[data-id]')?.dataset.id === id
      );
      cards[from + 1]?.focus();
    }, 0);
  const card = (item: NeedsItem) => {
    if (item.kind === 'login')
      return (
        <LoginCard
          decision={item.request.decision}
          login={item.request.login}
          state={item.request.state}
          machine={label(item.request.login.machineId)}
          now={now}
          interactive={interactive}
        />
      );
    if (item.kind === 'review')
      return (
        <ReviewCard
          item={item}
          now={now}
          interactive={interactive}
          onAnswered={focusNext(item.decision.id)}
        />
      );
    return (
      <AskCard
        item={item}
        now={now}
        interactive={interactive}
        onAnswered={focusNext(item.decision.id)}
      />
    );
  };
  const idOf = (item: NeedsItem) =>
    item.kind === 'login' ? item.request.decision.id : item.decision.id;

  return (
    <Section
      id="inbox"
      title={t('nav.inbox')}
      note={t('inbox.note')}
      actions={
        <Button asChild variant="outline" size="sm">
          <Link
            to="/{-$locale}/projects"
            params={{ locale: localeParam(locale) }}
          >
            <Folder />
            {t('projects.allThreads')}
          </Link>
        </Button>
      }
    >
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{t('inbox.needsYou')}</h3>
            <Badge variant="secondary" className="tabular-nums">
              {lanes.needs.length}
            </Badge>
            <span className="ml-auto text-muted-foreground text-sm">
              {t('inbox.mostUrgent')}
            </span>
          </div>
          <p className="hidden flex-wrap items-center gap-1.5 text-muted-foreground text-xs md:flex">
            <Kbd>J</Kbd>
            <Kbd>K</Kbd>
            {t('inbox.keys.move')}
            <Kbd>1</Kbd>
            <Kbd>2</Kbd>
            <Kbd>3</Kbd>
            {t('inbox.keys.choose')}
            <Kbd>R</Kbd>
            {t('inbox.keys.reply')}
            <Kbd>Ctrl/Cmd Enter</Kbd>
            {t('inbox.keys.sendNext')}
          </p>
          {/* Keys are handled on the list; each card is focusable. */}
          {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions */}
          {/* Every card, snoozed ones too, is a keyed entry of one array,
              so moving between Needs you and Snoozed never remounts a card
              or drops its queued answer, retry or draft. */}
          <div ref={list} className="space-y-3" onKeyDown={onListKey}>
            {[
              ...(lanes.needs.length
                ? []
                : [
                    <SectionMessage key="empty">
                      {t('inbox.empty.needs')}
                    </SectionMessage>,
                  ]),
              ...lanes.needs.map((item) => (
                <div key={idOf(item)} data-id={idOf(item)} className="contents">
                  {card(item)}
                </div>
              )),
              ...(lanes.snoozed.length
                ? [
                    <Button
                      key="snoozed-toggle"
                      variant="ghost"
                      size="sm"
                      aria-expanded={showSnoozed}
                      onClick={() => setShowSnoozed((open) => !open)}
                    >
                      {showSnoozed ? <ChevronDown /> : <ChevronRight />}
                      {t('inbox.snoozedTitle', { n: lanes.snoozed.length })}
                    </Button>,
                  ]
                : []),
              ...(showSnoozed && lanes.snoozed.length
                ? [
                    <p
                      key="snoozed-note"
                      className="text-muted-foreground text-sm"
                    >
                      {t('inbox.snoozeNote')}
                    </p>,
                  ]
                : []),
              ...lanes.snoozed.map((item) => (
                <div
                  key={item.decision.id}
                  data-id={item.decision.id}
                  data-hidden={showSnoozed ? undefined : ''}
                  className={showSnoozed ? 'contents' : 'hidden'}
                >
                  <AskCard item={item} now={now} interactive={interactive} />
                </div>
              )),
            ]}
          </div>
        </div>
        <div className="space-y-4">
          <FyiPanel lanes={lanes} showFyi={showFyi} />
          <RecentAnswers items={lanes.recent} />
        </div>
      </div>
    </Section>
  );
}
