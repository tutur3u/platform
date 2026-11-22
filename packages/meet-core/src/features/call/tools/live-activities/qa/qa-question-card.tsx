'use client';

import {
  ArrowBigUp,
  CheckCircle2,
  Eye,
  EyeOff,
  MessageSquare,
  Pin,
  PinOff,
  RotateCcw,
} from '@tuturuuu/icons';
import { LIVE_QA_LIMITS } from '@tuturuuu/realtime/meet';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ToolAction, ToolIconAction } from '../../tool-ui';
import { QaAnswers } from './qa-answers';
import { QaAttachments } from './qa-attachments';
import { QaComposer } from './qa-composer';
import { type QaBoardContext, QaChip, QaTime, useQaAuthor } from './qa-parts';
import { upvoteCount, upvotedByMe } from './qa-sort';
import type { LiveQaQuestion } from './qa-store';

export function QaUpvote({
  question,
  board,
  large,
}: {
  question: LiveQaQuestion;
  board: Pick<QaBoardContext, 'client' | 'self'>;
  large?: boolean;
}) {
  const t = useTranslations('meet.call.live_activities.qa');
  const voted = upvotedByMe(question, board.self);
  const count = upvoteCount(question);
  return (
    <button
      type="button"
      aria-pressed={voted}
      aria-label={t(voted ? 'remove_upvote' : 'upvote', { count })}
      disabled={question.hidden}
      className={cn(
        'flex shrink-0 flex-col items-center justify-center rounded-2xl border font-semibold tabular-nums transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
        large ? 'h-20 w-16 gap-1 text-xl' : 'h-14 w-11 text-sm',
        voted
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
      onClick={() =>
        board.client.send({
          type: 'qa.upvote',
          questionId: question.id,
          upvoted: !voted,
        })
      }
    >
      <ArrowBigUp
        className={cn(large ? 'size-6' : 'size-5', voted && 'fill-current')}
      />
      {count}
    </button>
  );
}

function HostActions({
  question,
  board,
}: {
  question: LiveQaQuestion;
  board: QaBoardContext;
}) {
  const t = useTranslations('meet.call.live_activities.qa');
  const moderate = (field: 'hidden' | 'answered', value: boolean) =>
    board.client.send({
      type: 'qa.moderate',
      questionId: question.id,
      field,
      value,
    });
  return (
    <div className="flex items-center">
      {question.hidden ? null : (
        <ToolIconAction
          icon={question.pinned ? PinOff : Pin}
          label={t(question.pinned ? 'unpin' : 'pin')}
          onClick={() =>
            board.client.send({
              type: 'qa.pin',
              questionId: question.id,
              pinned: !question.pinned,
            })
          }
        />
      )}
      <ToolIconAction
        icon={question.answered ? RotateCcw : CheckCircle2}
        label={t(question.answered ? 'reopen' : 'mark_answered')}
        onClick={() => moderate('answered', !question.answered)}
      />
      <ToolIconAction
        icon={question.hidden ? Eye : EyeOff}
        label={t(question.hidden ? 'show' : 'hide')}
        onClick={() => moderate('hidden', !question.hidden)}
      />
    </div>
  );
}

export function QaQuestionCard({
  question,
  board,
}: {
  question: LiveQaQuestion;
  board: QaBoardContext;
}) {
  const t = useTranslations('meet.call.live_activities');
  const author = useQaAuthor(board.self);
  const [answering, setAnswering] = useState(false);
  const voted = upvotedByMe(question, board.self);
  return (
    <article
      aria-label={question.text}
      className={cn(
        'space-y-3 rounded-2xl border bg-card p-3 @min-[360px]:p-4',
        question.pinned && 'border-dynamic-blue/40',
        question.hidden && 'border-dashed opacity-75'
      )}
    >
      <div className="flex gap-3">
        <QaUpvote question={question} board={board} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
            <span className="font-medium text-foreground">
              {author(question)}
            </span>
            <span aria-hidden="true" className="text-muted-foreground">
              ·
            </span>
            <QaTime iso={question.createdAt} />
            {question.pinned ? (
              <QaChip tone="pinned">{t('qa.pinned')}</QaChip>
            ) : null}
            {question.answered ? (
              <QaChip tone="answered">{t('qa.answered_chip')}</QaChip>
            ) : null}
            {voted ? <QaChip tone="voted">{t('qa.you_voted')}</QaChip> : null}
            {question.anonymous ? (
              <QaChip>{t('qa.anonymous_author')}</QaChip>
            ) : null}
            {question.hidden ? (
              <QaChip tone="hidden">{t('qa.hidden_chip')}</QaChip>
            ) : null}
          </div>
          <p className="wrap-break-word whitespace-pre-wrap font-medium text-sm @min-[360px]:text-base">
            {question.text}
          </p>
          <QaAttachments
            meetingId={board.meetingId}
            ids={question.attachmentIds}
            guest={board.self?.guest}
          />
        </div>
        {board.isHost ? (
          <HostActions question={question} board={board} />
        ) : null}
      </div>
      <QaAnswers question={question} board={board} />
      {answering ? (
        <QaComposer
          meetingId={board.meetingId}
          label={t('qa.answer_label')}
          placeholder={t('qa.answer_placeholder')}
          submitLabel={t('qa.send')}
          maxLength={LIVE_QA_LIMITS.answerChars}
          allowEmptyText
          canAttach={!board.self?.guest}
          autoFocus
          cancelLabel={t('cancel')}
          onCancel={() => setAnswering(false)}
          onUploadError={board.onUploadError}
          onSubmit={(text, attachmentIds) => {
            board.client.send({
              type: 'qa.answer',
              questionId: question.id,
              text,
              attachmentIds,
            });
            setAnswering(false);
          }}
        />
      ) : board.canAnswer && !question.hidden ? (
        <ToolAction
          icon={MessageSquare}
          label={t('qa.answer')}
          variant="ghost"
          className="pointer-coarse:h-11"
          onClick={() => setAnswering(true)}
        />
      ) : null}
    </article>
  );
}
