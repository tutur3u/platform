'use client';

import { Check, Flag, Lock, Timer, Users, X, Zap } from '@tuturuuu/icons';
import type {
  ProjectedArenaTile,
  QuizArenaFullView,
} from '@tuturuuu/realtime/meet/room-quiz-arena';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback } from 'react';
import type { QuizArenaAction } from '../server/quiz-arena';
import { arenaColor, MiraAttribution, Pill, Swatch } from './quiz-arena-kit';
import {
  AnswerArea,
  BuzzButton,
  BuzzQueue,
  TimerRing,
  WagerBox,
} from './quiz-arena-play';

type Props = {
  view: QuizArenaFullView;
  selfId: string;
  tile: ProjectedArenaTile;
  busy: boolean;
  onAction: (action: QuizArenaAction) => void;
};

function signed(locale: string, value: number) {
  return new Intl.NumberFormat(locale, { signDisplay: 'always' }).format(value);
}

export function QuizArenaQuestion({
  view,
  selfId,
  tile,
  busy,
  onAction,
}: Props) {
  const t = useTranslations('meet.call.quizArena');
  const { meta, canManage } = view;
  const category = tile.isFinal
    ? (meta.finalCategory ?? '')
    : (meta.categories[tile.categoryIndex] ?? '');
  const buzzMode = meta.answerMode === 'buzz_in' && !tile.isFinal;
  const myBuzz = tile.buzzQueue.find(({ userId }) => userId === selfId);
  const myTurn = myBuzz?.status === 'answering';
  const needsWager =
    !canManage &&
    tile.status === 'active' &&
    (tile.isFinal ? meta.phase === 'final_wager' : tile.isBonusWager);
  const players = view.players.length;
  const buzz = useCallback(
    () => onAction({ action: 'buzz', tileId: tile.id }),
    [onAction, tile.id]
  );
  return (
    <article className="space-y-3 rounded-2xl border border-border bg-card p-3">
      <header className="flex flex-wrap items-center gap-1.5">
        <Pill className="bg-primary text-primary-foreground">
          {tile.isFinal && <Flag aria-hidden />}
          {tile.isFinal ? `${t('final_round')} · ${category}` : category}
        </Pill>
        <Pill className="bg-dynamic-yellow/10 text-dynamic-yellow tabular-nums">
          {t('points', { points: tile.points })}
        </Pill>
        {!tile.isFinal && (
          <Pill>
            {buzzMode ? <Zap aria-hidden /> : <Users aria-hidden />}
            {buzzMode ? t('mode_buzz_in') : t('mode_all_answer')}
          </Pill>
        )}
        {tile.isBonusWager && !tile.isFinal && (
          <Pill className="bg-dynamic-yellow/10 text-dynamic-yellow">
            <Zap aria-hidden />
            {t('bonus_tile')}
          </Pill>
        )}
        <span className="ml-auto">
          {tile.openedAt !== null && tile.status === 'active' ? (
            <TimerRing tile={tile} />
          ) : (
            tile.isFinal &&
            meta.phase === 'final_wager' && (
              <Pill>
                <Timer aria-hidden />
                {t('final_wager_stage')}
              </Pill>
            )
          )}
        </span>
      </header>

      {needsWager && (
        <WagerBox
          view={view}
          selfId={selfId}
          tile={tile}
          busy={busy}
          onAction={onAction}
        />
      )}

      {tile.question ? (
        <p className="break-words font-extrabold text-foreground text-lg leading-snug">
          {tile.question.question}
        </p>
      ) : (
        <p className="font-bold text-lg text-muted-foreground">
          {tile.isFinal ? t('final_intro') : t('question_after_wager')}
        </p>
      )}

      {tile.question &&
        (!buzzMode || myTurn || tile.status === 'revealed' || canManage) && (
          <AnswerArea
            tile={tile}
            busy={busy}
            disabled={canManage || (buzzMode && !myTurn)}
            onAction={onAction}
          />
        )}

      {tile.isFinal && view.teams.length > 0 && tile.status === 'active' && (
        <FinalTeams view={view} tile={tile} />
      )}

      {buzzMode && tile.status === 'active' && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <BuzzQueue view={view} tile={tile} busy={busy} onAction={onAction} />
          {!canManage && (
            <div className="flex flex-col items-center gap-1">
              <BuzzButton
                disabled={
                  busy || meta.buzzersLocked || !!myBuzz || !tile.question
                }
                onBuzz={buzz}
              />
              <span className="text-center font-bold text-muted-foreground text-sm">
                {myTurn
                  ? t('your_turn')
                  : myBuzz
                    ? t('waiting_turn')
                    : meta.buzzersLocked
                      ? t('buzzers_locked')
                      : ''}
              </span>
            </div>
          )}
        </div>
      )}

      {!buzzMode && tile.status === 'active' && (
        <div className="flex flex-wrap items-center gap-2">
          <Pill className="tabular-nums">
            <Users aria-hidden />
            {t('answered_count', { count: tile.answerCount, total: players })}
          </Pill>
          {meta.playMode === 'teams' && (
            <span className="font-bold text-muted-foreground text-xs">
              {t('team_majority')}
            </span>
          )}
          <Pill className="ml-auto border border-border bg-transparent text-muted-foreground">
            {t('results_hidden')}
          </Pill>
        </div>
      )}

      {canManage &&
        !buzzMode &&
        tile.question?.type === 'open_text' &&
        !!tile.answers?.length && (
          <HostJudging tile={tile} busy={busy} onAction={onAction} />
        )}

      {tile.status === 'revealed' && <RevealCard view={view} tile={tile} />}
    </article>
  );
}

function FinalTeams({
  view,
  tile,
}: {
  view: QuizArenaFullView;
  tile: ProjectedArenaTile;
}) {
  const t = useTranslations('meet.call.quizArena');
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {view.teams.map((team, index) => {
        const locked = tile.wageredTeamIds.includes(team.id);
        return (
          <li
            key={team.id}
            className="flex flex-col gap-1.5 rounded-2xl border border-border bg-background p-3"
          >
            <div className="flex min-w-0 items-center gap-2">
              <Swatch label={team.name} color={arenaColor(index).chip} />
              <b className="min-w-0 truncate">{team.name}</b>
              <Pill
                className={cn(
                  'ml-auto',
                  locked
                    ? 'bg-dynamic-green/10 text-dynamic-green'
                    : 'bg-dynamic-yellow/10 text-dynamic-yellow'
                )}
              >
                {locked && <Lock aria-hidden />}
                {locked ? t('wager_locked_short') : t('wagering')}
              </Pill>
            </div>
            <span className="font-bold text-muted-foreground text-xs">
              {t('wager_hidden')}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function HostJudging({ tile, busy, onAction }: Omit<Props, 'view' | 'selfId'>) {
  const t = useTranslations('meet.call.quizArena');
  return (
    <ul
      aria-label={t('answers_to_judge')}
      className="max-h-60 space-y-1 overflow-y-auto"
    >
      {(tile.answers ?? []).map((answer) => (
        <li
          key={answer.userId}
          className="flex min-w-0 items-center gap-2 rounded-xl bg-muted/50 px-2 py-1.5 text-sm"
        >
          <b className="w-28 shrink-0 truncate">{answer.displayName}</b>
          <span className="min-w-0 flex-1 break-words">
            {'text' in answer.answer ? answer.answer.text : ''}
          </span>
          <Button
            size="xs"
            variant={answer.correct === true ? 'default' : 'outline'}
            aria-label={`${t('correct')}: ${answer.displayName}`}
            disabled={busy}
            onClick={() =>
              onAction({
                action: 'judge',
                tileId: tile.id,
                userId: answer.userId,
                correct: true,
              })
            }
          >
            <Check className="size-3.5" />
          </Button>
          <Button
            size="xs"
            variant={answer.correct === false ? 'destructive' : 'outline'}
            aria-label={`${t('wrong')}: ${answer.displayName}`}
            disabled={busy}
            onClick={() =>
              onAction({
                action: 'judge',
                tileId: tile.id,
                userId: answer.userId,
                correct: false,
              })
            }
          >
            <X className="size-3.5" />
          </Button>
        </li>
      ))}
    </ul>
  );
}

function RevealCard({
  view,
  tile,
}: {
  view: QuizArenaFullView;
  tile: ProjectedArenaTile;
}) {
  const t = useTranslations('meet.call.quizArena');
  const locale = useLocale();
  const accepted = tile.reveal?.acceptedAnswers ?? [];
  return (
    <div className="space-y-2 rounded-xl bg-muted/50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <b>{t('explanation')}</b>
        {view.meta.source === 'mira' && (
          <MiraAttribution label={t('generated_by_mira')} className="ml-auto" />
        )}
      </div>
      {tile.reveal?.explanation && (
        <p className="break-words text-sm">{tile.reveal.explanation}</p>
      )}
      {accepted.length > 0 && (
        <p className="text-muted-foreground text-sm">
          {t('accepted_answers', { answers: accepted.join(', ') })}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {tile.myResult && (
          <Pill
            className={
              tile.myResult.correct
                ? 'bg-dynamic-green/10 text-dynamic-green'
                : 'bg-dynamic-red/10 text-dynamic-red'
            }
          >
            {tile.myResult.correct
              ? t('result_correct', {
                  delta: signed(locale, tile.myResult.delta),
                })
              : t('result_wrong', {
                  delta: signed(locale, tile.myResult.delta),
                })}
          </Pill>
        )}
        {tile.results && (
          <Pill className="tabular-nums">
            <Check aria-hidden />
            {t('correct_count', {
              count: tile.results.correctCount,
              total: tile.answerCount,
            })}
          </Pill>
        )}
      </div>
    </div>
  );
}
