'use client';

import {
  Check,
  ChevronLeft,
  ChevronRight,
  Layers,
  PencilLine,
  RotateCw,
} from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ToolAction, ToolIconAction } from '../../tool-ui';
import {
  ActivityEmpty,
  ActivityNotice,
  ActivitySection,
  useActivity,
} from '../activity-kit';
import type { MeetToolPanelProps } from '../meet-tool';
import { LiveActivityPanelFrame } from '../panel-frame';
import { FlashcardsDeckEditor } from './flashcards-deck-editor';

/**
 * A deck the room reviews together. The host picks and flips the card for
 * everyone; each person may peek for themselves and keeps their own progress.
 */
export function FlashcardsPanel({ onClose }: MeetToolPanelProps) {
  const activity = useActivity();
  const t = useTranslations('meet.call.live_activities.flashcards');
  const { cards, index, flipped } = activity.snapshot.flashcards;
  const card = cards[index];
  const known = activity.mine.flashcards.known;
  const [editing, setEditing] = useState(false);
  // A private peek at the other side; a new card or a room flip resets it.
  const [peek, setPeek] = useState<string | null>(null);
  const showBack = card
    ? flipped !== (peek === `${card.id}:${flipped}`)
    : false;
  const progress = activity.host?.flashcards.progress ?? [];
  const show = (next: number, side: boolean) =>
    activity.send({ kind: 'flashcards.show', index: next, flipped: side });
  return (
    <LiveActivityPanelFrame
      title={t('title')}
      icon={Layers}
      subtitle={
        cards.length
          ? t('position', { current: index + 1, total: cards.length })
          : undefined
      }
      onClose={onClose}
    >
      {card ? (
        <>
          <button
            type="button"
            aria-label={t(showBack ? 'show_front' : 'show_back')}
            onClick={() =>
              setPeek(
                peek === `${card.id}:${flipped}`
                  ? null
                  : `${card.id}:${flipped}`
              )
            }
            className="grid min-h-44 w-full place-items-center rounded-3xl border bg-card p-6 text-center transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          >
            <span className="space-y-2">
              <span className="block font-semibold text-muted-foreground text-xs">
                {t(showBack ? 'back' : 'front')}
              </span>
              <span className="block wrap-break-word text-balance font-semibold text-lg">
                {showBack ? card.back : card.front}
              </span>
            </span>
          </button>
          {activity.canManage && (
            <div className="flex items-center justify-center gap-2">
              <ToolIconAction
                icon={ChevronLeft}
                label={t('previous')}
                disabled={index === 0}
                onClick={() => show(index - 1, false)}
              />
              <ToolAction
                icon={RotateCw}
                label={t('flip_for_room')}
                variant="default"
                onClick={() => show(index, !flipped)}
              />
              <ToolIconAction
                icon={ChevronRight}
                label={t('next')}
                disabled={index >= cards.length - 1}
                onClick={() => show(index + 1, false)}
              />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <ToolAction
              icon={Check}
              label={t(known.includes(card.id) ? 'still_learning' : 'know_it')}
              variant={known.includes(card.id) ? 'secondary' : 'outline'}
              aria-pressed={known.includes(card.id)}
              onClick={() =>
                activity.send({
                  kind: 'flashcards.mark',
                  cardId: card.id,
                  known: !known.includes(card.id),
                })
              }
            />
            <span className="text-muted-foreground text-sm">
              {t('my_progress', { known: known.length, total: cards.length })}
            </span>
          </div>
        </>
      ) : (
        <ActivityEmpty>
          {t(activity.canManage ? 'empty_host' : 'empty_participant')}
        </ActivityEmpty>
      )}
      {activity.canManage && progress.length > 0 && (
        <ActivitySection title={t('room_progress')}>
          <ul className="space-y-1 text-sm">
            {progress.map((entry) => (
              <li key={entry.participantId} className="flex gap-2">
                <span className="min-w-0 flex-1 truncate">
                  {activity.nameOf(entry.participantId)}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {t('known_count', {
                    known: entry.known,
                    total: cards.length,
                  })}
                </span>
              </li>
            ))}
          </ul>
        </ActivitySection>
      )}
      {activity.canManage && (
        <ActivitySection
          title={t('deck')}
          aside={
            <ToolAction
              icon={PencilLine}
              label={t(editing ? 'done_editing' : 'edit_deck')}
              variant="ghost"
              aria-expanded={editing || !cards.length}
              onClick={() => setEditing(!editing)}
            />
          }
        >
          {(editing || !cards.length) && (
            <FlashcardsDeckEditor
              // The room issues new ids on save; start again from what it stored.
              key={cards.map(({ id }) => id).join(':')}
              cards={cards}
              send={activity.send}
            />
          )}
        </ActivitySection>
      )}
      <ActivityNotice error={activity.error} />
    </LiveActivityPanelFrame>
  );
}
