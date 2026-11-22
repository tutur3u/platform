'use client';

import {
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Layers,
  PencilLine,
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

function CardSide({ label, text }: { label: string; text: string }) {
  return (
    <div className="space-y-2">
      <p className="font-semibold text-muted-foreground text-xs">{label}</p>
      <p className="wrap-break-word text-balance font-semibold text-lg">
        {text}
      </p>
    </div>
  );
}

/**
 * A deck the room reviews together. Backs stay with hosts and co-hosts until
 * one of them reveals the card on show; everyone keeps their own progress.
 */
export function FlashcardsPanel({ onClose }: MeetToolPanelProps) {
  const activity = useActivity();
  const t = useTranslations('meet.call.live_activities.flashcards');
  const { cards, index, flipped } = activity.snapshot.flashcards;
  const card = cards[index];
  // Managers hold the whole deck; the room's copy has fronts only.
  const deck = activity.host?.flashcards.cards ?? [];
  const full = card ? deck.find(({ id }) => id === card.id) : undefined;
  const known = activity.mine.flashcards.known;
  const [editing, setEditing] = useState(false);
  const progress = activity.host?.flashcards.progress ?? [];
  // The command names the card seen here, so the room can refuse it once
  // another deck has put a different card at that position.
  const show = (next: number, side: boolean) => {
    const target = cards[next];
    if (target)
      activity.send({
        kind: 'flashcards.show',
        cardId: target.id,
        index: next,
        flipped: side,
      });
  };
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
          {/* The card is plain text, read out again whenever it changes. */}
          <div
            aria-live="polite"
            aria-atomic="true"
            className="grid min-h-44 place-items-center gap-5 rounded-3xl border bg-card p-6 text-center"
          >
            {activity.canManage ? (
              <>
                <CardSide label={t('front')} text={card.front} />
                {full && <CardSide label={t('back')} text={full.back} />}
              </>
            ) : flipped && card.back ? (
              <CardSide label={t('back')} text={card.back} />
            ) : (
              <CardSide label={t('front')} text={card.front} />
            )}
          </div>
          {activity.canManage && (
            <>
              <div className="flex items-center justify-center gap-2">
                <ToolIconAction
                  icon={ChevronLeft}
                  label={t('previous')}
                  disabled={index === 0}
                  onClick={() => show(index - 1, false)}
                />
                <ToolAction
                  icon={flipped ? EyeOff : Eye}
                  label={t(flipped ? 'hide' : 'reveal')}
                  // The name starts with the visible label and says which card.
                  aria-label={`${t(flipped ? 'hide' : 'reveal')}: ${card.front}`}
                  variant={flipped ? 'outline' : 'default'}
                  aria-pressed={flipped}
                  onClick={() => show(index, !flipped)}
                />
                <ToolIconAction
                  icon={ChevronRight}
                  label={t('next')}
                  disabled={index >= cards.length - 1}
                  onClick={() => show(index + 1, false)}
                />
              </div>
              <p
                role="status"
                className="text-center text-muted-foreground text-xs"
              >
                {t(flipped ? 'room_sees_back' : 'room_sees_front')}
              </p>
            </>
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
            <FlashcardsDeckEditor cards={deck} send={activity.send} />
          )}
        </ActivitySection>
      )}
      <ActivityNotice error={activity.error} stale={activity.stale} />
    </LiveActivityPanelFrame>
  );
}
