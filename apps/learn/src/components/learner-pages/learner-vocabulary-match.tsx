'use client';

import { Check, RotateCcw } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { MatchCard } from './learner-vocabulary-utils';

interface Props {
  cards: MatchCard[];
  finished: boolean;
  matchedIds: string[];
  matchedSet: Set<string>;
  mismatchIds: string[];
  resetPractice: () => void;
  selectCard: (card: MatchCard) => void;
  selected: MatchCard | null;
  vocabularyCount: number;
}

export function LearnerVocabularyMatch({
  cards,
  finished,
  matchedIds,
  matchedSet,
  mismatchIds,
  resetPractice,
  selectCard,
  selected,
  vocabularyCount,
}: Props) {
  const t = useTranslations('learnerVocabulary');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-bold text-sm">
          {finished
            ? t('allMatched')
            : t('matchedProgress', {
                matched: matchedIds.length / 2,
                total: vocabularyCount,
              })}
        </p>
        <button
          className="inline-flex items-center gap-2 border-2 border-border bg-background px-3 py-1.5 font-bold text-sm shadow-[2px_2px_0_var(--border)]"
          onClick={resetPractice}
          type="button"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t('reviewWords')}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {cards.map((card) => {
          const isMatched = matchedSet.has(card.id);
          const isSelected = selected?.id === card.id;
          const isMismatch = mismatchIds.includes(card.id);

          return (
            <button
              className={cn(
                'min-h-24 border-2 border-border bg-background p-4 text-left font-bold text-sm shadow-[3px_3px_0_var(--border)] transition',
                isSelected && 'bg-dynamic-cyan/15',
                isMismatch && 'bg-destructive/10',
                isMatched &&
                  'border-dynamic-green/70 bg-dynamic-green/10 text-dynamic-green'
              )}
              disabled={isMatched}
              key={card.id}
              onClick={() => selectCard(card)}
              type="button"
            >
              <span className="mb-2 block text-[10px] text-muted-foreground uppercase tracking-widest">
                {card.side === 'word' ? t('word') : t('definition')}
              </span>
              <span className="flex items-start justify-between gap-2">
                {card.label}
                {isMatched ? <Check className="h-4 w-4 shrink-0" /> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
