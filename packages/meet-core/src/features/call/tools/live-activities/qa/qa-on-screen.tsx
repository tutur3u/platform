'use client';

import { CheckCircle2, SkipForward } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { ToolAction } from '../../tool-ui';
import { type QaBoardContext, QaChip, useQaAuthor } from './qa-parts';
import { QaUpvote } from './qa-question-card';
import { onScreenQuestion, sortLiveQa } from './qa-sort';
import type { LiveQaQuestion } from './qa-store';

/**
 * The full-screen rail: the pinned question, or the top open one, large
 * enough to read across a room. Hosts mark it answered or put up the next.
 */
export function QaOnScreen({
  questions,
  board,
}: {
  questions: readonly LiveQaQuestion[];
  board: Pick<QaBoardContext, 'client' | 'self' | 'isHost'>;
}) {
  const headingId = useId();
  const t = useTranslations('meet.call.live_activities.qa');
  const author = useQaAuthor(board.self);
  const current = onScreenQuestion(questions);
  const next = current
    ? sortLiveQa(questions, 'top').find(
        (question) => question.id !== current.id
      )
    : undefined;
  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <h3
        id={headingId}
        className="font-semibold text-muted-foreground text-xs uppercase tracking-wide"
      >
        {t('on_screen')}
      </h3>
      {current ? (
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <QaUpvote question={current} board={board} large />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="wrap-break-word whitespace-pre-wrap font-semibold text-2xl leading-snug">
                {current.text}
              </p>
              <p className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-sm">
                {author(current)}
                {current.pinned ? (
                  <QaChip tone="pinned">{t('pinned')}</QaChip>
                ) : null}
              </p>
            </div>
          </div>
          {board.isHost ? (
            <div className="flex flex-wrap gap-2">
              <ToolAction
                icon={CheckCircle2}
                label={t('mark_answered')}
                onClick={() =>
                  board.client.send({
                    type: 'qa.moderate',
                    questionId: current.id,
                    field: 'answered',
                    value: true,
                  })
                }
              />
              <ToolAction
                icon={SkipForward}
                label={t('next')}
                variant="ghost"
                disabled={!next}
                onClick={() =>
                  next &&
                  board.client.send({
                    type: 'qa.pin',
                    questionId: next.id,
                    pinned: true,
                  })
                }
              />
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{t('empty')}</p>
      )}
    </section>
  );
}
