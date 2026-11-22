'use client';

import { Plus, Save, Trash2 } from '@tuturuuu/icons';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { ToolAction, ToolIconAction } from '../../tool-ui';
import type { Activity } from '../activity-kit';
import { useRoomDraft } from '../room-draft';

export const MAX_FLASHCARDS = 60;

type DraftCard = { key: string; front: string; back: string };

const cleaned = (cards: readonly DraftCard[]) =>
  cards.map(({ front, back }) => ({ front: front.trim(), back: back.trim() }));

/** Two drafts hold the same words, whatever ids the room gave the cards. */
const sameCards = (a: readonly DraftCard[], b: readonly DraftCard[]) =>
  JSON.stringify(a.map(({ front, back }) => [front, back])) ===
  JSON.stringify(b.map(({ front, back }) => [front, back]));

/** The host's deck. Saving replaces the room's deck and starts progress again. */
export function FlashcardsDeckEditor({
  cards,
  send,
}: {
  /** The full deck, which only managers hold. */
  cards: NonNullable<Activity['host']>['flashcards']['cards'];
  send: Activity['send'];
}) {
  const t = useTranslations('meet.call.live_activities.flashcards');
  const saved = cards.map(({ id, front, back }) => ({ key: id, front, back }));
  // The room issues new ids on save and repeats the deck after a reconnect;
  // neither may replace a card the host is still writing.
  const [drafts, setDrafts] = useRoomDraft<DraftCard[]>(saved, sameCards);
  const next = cleaned(drafts);
  const complete = next.every(({ front, back }) => front && back);
  const dirty = JSON.stringify(next) !== JSON.stringify(cleaned(saved));
  const update = (key: string, patch: Partial<DraftCard>) =>
    setDrafts((current) =>
      current.map((card) => (card.key === key ? { ...card, ...patch } : card))
    );
  return (
    <div className="space-y-2.5">
      <ol className="space-y-2">
        {drafts.map((card, index) => (
          <li key={card.key} className="flex items-start gap-2">
            <span className="w-5 pt-2.5 text-right text-muted-foreground text-xs tabular-nums">
              {index + 1}
            </span>
            <div className="grid min-w-0 flex-1 gap-1.5">
              <Input
                value={card.front}
                maxLength={200}
                aria-label={t('front_of', { number: index + 1 })}
                placeholder={t('front')}
                onChange={(event) =>
                  update(card.key, { front: event.target.value })
                }
              />
              <Input
                value={card.back}
                maxLength={400}
                aria-label={t('back_of', { number: index + 1 })}
                placeholder={t('back')}
                onChange={(event) =>
                  update(card.key, { back: event.target.value })
                }
              />
            </div>
            <ToolIconAction
              icon={Trash2}
              label={t('remove_card', { number: index + 1 })}
              onClick={() =>
                setDrafts((current) =>
                  current.filter((entry) => entry.key !== card.key)
                )
              }
            />
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <ToolAction
          icon={Plus}
          label={t('add_card')}
          disabled={drafts.length >= MAX_FLASHCARDS}
          onClick={() =>
            setDrafts((current) => [
              ...current,
              { key: crypto.randomUUID(), front: '', back: '' },
            ])
          }
        />
        <ToolAction
          icon={Save}
          label={t('save_deck')}
          variant="default"
          disabled={!dirty || !complete}
          onClick={() => send({ kind: 'flashcards.set', cards: next })}
        />
      </div>
      {dirty && (
        <p className="text-muted-foreground text-xs">
          {t(complete ? 'save_hint' : 'incomplete')}
        </p>
      )}
    </div>
  );
}
