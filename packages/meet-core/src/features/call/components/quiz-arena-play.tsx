'use client';

import { Check, Lock, X, Zap } from '@tuturuuu/icons';
import type {
  ProjectedArenaTile,
  QuizArenaFullView,
} from '@tuturuuu/realtime/meet/room-quiz-arena';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { cn } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import type { QuizArenaAction } from '../server/quiz-arena';
import { arenaColor, colorFor, Pill, Swatch } from './quiz-arena-kit';

type Act = (action: QuizArenaAction) => void;
const LETTERS = 'ABCDEF';
const OPTION_COLORS = [0, 1, 2, 3, 6, 4];

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

/** Countdown ring with a slim bar for narrow layouts. */
export function TimerRing({ tile }: { tile: ProjectedArenaTile }) {
  const t = useTranslations('meet.call.quizArena');
  const running = tile.status === 'active' && tile.openedAt !== null;
  const now = useNow(running);
  const total = tile.timeLimitSec * 1000;
  const left = running
    ? Math.max(0, (tile.openedAt ?? now) + total - now)
    : total;
  const ratio = left / total;
  const seconds = Math.ceil(left / 1000);
  const tone =
    ratio > 0.5
      ? 'stroke-dynamic-green'
      : ratio > 0.2
        ? 'stroke-dynamic-yellow'
        : 'stroke-dynamic-red';
  return (
    <div
      role="timer"
      aria-label={t('time_left', { seconds })}
      className="relative size-16 shrink-0"
    >
      <svg viewBox="0 0 64 64" className="size-full -rotate-90" aria-hidden>
        <circle
          cx="32"
          cy="32"
          r="28"
          className="fill-none stroke-muted"
          strokeWidth="8"
        />
        <circle
          cx="32"
          cy="32"
          r="28"
          className={cn(
            'fill-none motion-safe:transition-[stroke-dashoffset] motion-safe:duration-300',
            tone
          )}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={2 * Math.PI * 28}
          strokeDashoffset={2 * Math.PI * 28 * (1 - ratio)}
        />
      </svg>
      <b className="absolute inset-0 grid place-items-center font-extrabold font-mono text-lg tabular-nums">
        {String(seconds).padStart(2, '0')}
      </b>
    </div>
  );
}

export function WagerBox({
  view,
  selfId,
  tile,
  busy,
  onAction,
}: {
  view: QuizArenaFullView;
  selfId: string;
  tile: ProjectedArenaTile;
  busy: boolean;
  onAction: Act;
}) {
  const t = useTranslations('meet.call.quizArena');
  const locale = useLocale();
  const me = view.players.find((p) => p.userId === selfId);
  const team = view.teams.find(({ id }) => id === me?.teamId);
  const max = Math.max(team?.score ?? me?.score ?? 0, tile.points);
  const [amount, setAmount] = useState(Math.min(tile.points, max));
  const format = new Intl.NumberFormat(locale);
  if (tile.myWager !== null)
    return (
      <Pill className="bg-dynamic-yellow/10 text-dynamic-yellow">
        <Lock aria-hidden />
        {t('wager_locked', { amount: format.format(tile.myWager) })}
      </Pill>
    );
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-dynamic-yellow/10 p-4 text-dynamic-yellow">
      <div className="flex items-center gap-2">
        <Zap aria-hidden className="size-5" />
        <span className="font-extrabold text-base">
          {team ? t('wager_team', { team: team.name }) : t('wager_title')}
        </span>
        <span className="ml-auto font-extrabold font-mono text-lg tabular-nums">
          {format.format(amount)}
        </span>
      </div>
      <input
        type="range"
        aria-label={t('wager_amount')}
        min={0}
        max={max}
        step={Math.max(1, Math.round(tile.points / 10))}
        value={amount}
        onChange={(event) => setAmount(Number(event.target.value))}
        className="w-full accent-dynamic-yellow"
      />
      <div className="flex font-bold text-xs tabular-nums">
        <span>{t('wager_min', { amount: 0 })}</span>
        <span className="ml-auto">
          {t(team ? 'wager_max_team' : 'wager_max', {
            amount: format.format(max),
          })}
        </span>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setAmount(Math.min(tile.points * 2, max))}
        >
          {t('wager_double')}
        </Button>
        <Button
          size="sm"
          className="ml-auto"
          disabled={busy}
          onClick={() => onAction({ action: 'wager', tileId: tile.id, amount })}
        >
          {t(team ? 'lock_team_wager' : 'lock_wager')}
        </Button>
      </div>
    </div>
  );
}

/** Choice buttons, or a short-answer field, with reveal percentages. */
export function AnswerArea({
  tile,
  busy,
  disabled,
  onAction,
}: {
  tile: ProjectedArenaTile;
  busy: boolean;
  disabled: boolean;
  onAction: Act;
}) {
  const t = useTranslations('meet.call.quizArena');
  const [text, setText] = useState('');
  if (!tile.question) return null;
  const { question } = tile;
  const total =
    tile.results?.tally.reduce((sum, { count }) => sum + count, 0) ?? 0;
  if (question.type === 'single_choice')
    return (
      <div className="grid gap-2 @min-[360px]:grid-cols-2">
        {(question.options ?? []).map((option, index) => {
          const chosen =
            tile.myAnswer &&
            'optionId' in tile.myAnswer &&
            tile.myAnswer.optionId === option.id;
          const correct =
            tile.reveal?.correctOptionIds.includes(option.id) &&
            tile.status === 'revealed';
          const count =
            tile.results?.tally.find(({ optionId }) => optionId === option.id)
              ?.count ?? 0;
          const color = arenaColor(OPTION_COLORS[index] ?? index);
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={!!chosen}
              disabled={disabled || busy || tile.status !== 'active'}
              onClick={() =>
                onAction({
                  action: 'answer',
                  tileId: tile.id,
                  answer: { optionId: option.id },
                })
              }
              className={cn(
                'flex min-h-12 min-w-0 items-center gap-3 rounded-xl border border-border bg-background p-2 text-left font-bold text-sm',
                'motion-safe:transition-colors motion-reduce:transition-none enabled:hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
                chosen && 'border-2 border-primary',
                correct && 'border-2 border-dynamic-green bg-dynamic-green/10'
              )}
            >
              <span
                className={cn(
                  'grid size-8 shrink-0 place-items-center rounded-lg text-sm',
                  correct
                    ? 'bg-dynamic-green/15 text-dynamic-green'
                    : color.chip
                )}
              >
                {correct ? (
                  <Check aria-hidden className="size-4" />
                ) : (
                  LETTERS[index]
                )}
              </span>
              <span className="min-w-0 flex-1 break-words">{option.label}</span>
              {tile.results && (
                <span className="ml-auto text-muted-foreground text-xs tabular-nums">
                  {total ? Math.round((100 * count) / total) : 0}%
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  const mine =
    tile.myAnswer && 'text' in tile.myAnswer ? tile.myAnswer.text : null;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (text.trim())
      onAction({
        action: 'answer',
        tileId: tile.id,
        answer: { text: text.trim() },
      });
  };
  return (
    <form onSubmit={submit} className="flex gap-2">
      <Input
        aria-label={t('your_answer')}
        placeholder={mine ?? t('your_answer')}
        maxLength={200}
        value={text}
        disabled={disabled || tile.status !== 'active'}
        onChange={(event) => setText(event.target.value)}
      />
      <Button
        type="submit"
        disabled={disabled || busy || !text.trim() || tile.status !== 'active'}
      >
        {t(mine ? 'update_answer' : 'submit_answer')}
      </Button>
    </form>
  );
}

export function BuzzQueue({
  view,
  tile,
  busy,
  onAction,
}: {
  view: QuizArenaFullView;
  tile: ProjectedArenaTile;
  busy: boolean;
  onAction: Act;
}) {
  const t = useTranslations('meet.call.quizArena');
  const teamName = (userId: string) => {
    const teamId = view.players.find((p) => p.userId === userId)?.teamId;
    return view.teams.find(({ id }) => id === teamId)?.name;
  };
  return (
    <section
      aria-label={t('buzz_order')}
      className="min-w-0 flex-1 space-y-1.5"
    >
      <div className="flex items-center font-bold text-sm">
        {t('buzz_order')}
        <span className="ml-auto text-muted-foreground text-xs">
          {t('buzzed_count', { count: tile.buzzQueue.length })}
        </span>
      </div>
      <ol className="max-h-56 space-y-1 overflow-y-auto">
        {tile.buzzQueue.map((buzz, index) => {
          const team = teamName(buzz.userId);
          const answering = buzz.status === 'answering';
          return (
            <li
              key={buzz.userId}
              className={cn(
                'flex min-w-0 items-center gap-2 rounded-xl px-2 py-1.5',
                answering ? 'bg-dynamic-yellow/10' : 'bg-background',
                buzz.status === 'wrong' && 'opacity-60'
              )}
            >
              <span className="w-4 text-center font-extrabold font-mono text-muted-foreground text-xs">
                {index + 1}
              </span>
              <Swatch
                label={buzz.displayName}
                color={colorFor(buzz.userId).chip}
              />
              <b className="min-w-0 flex-1 truncate text-sm">
                {team ? `${buzz.displayName} · ${team}` : buzz.displayName}
              </b>
              <span className="font-mono text-muted-foreground text-xs tabular-nums">
                {tile.openedAt
                  ? `${((buzz.buzzedAt - tile.openedAt) / 1000).toFixed(2)}s`
                  : ''}
              </span>
              {buzz.status === 'correct' && (
                <Check
                  aria-label={t('correct')}
                  className="size-4 text-dynamic-green"
                />
              )}
              {buzz.status === 'wrong' && (
                <X
                  aria-label={t('wrong')}
                  className="size-4 text-dynamic-red"
                />
              )}
              {view.canManage && answering && (
                <span className="flex gap-1">
                  <Button
                    size="xs"
                    className="bg-dynamic-green text-background hover:bg-dynamic-green/90"
                    disabled={busy}
                    onClick={() =>
                      onAction({
                        action: 'judge',
                        tileId: tile.id,
                        userId: buzz.userId,
                        correct: true,
                      })
                    }
                  >
                    <Check aria-hidden className="size-3.5" />
                    {t('correct')}
                  </Button>
                  <Button
                    size="xs"
                    variant="destructive"
                    disabled={busy}
                    onClick={() =>
                      onAction({
                        action: 'judge',
                        tileId: tile.id,
                        userId: buzz.userId,
                        correct: false,
                      })
                    }
                  >
                    <X aria-hidden className="size-3.5" />
                    {t('wrong')}
                  </Button>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Big buzzer; Space buzzes too while the tile is open. */
export function BuzzButton({
  disabled,
  onBuzz,
}: {
  disabled: boolean;
  onBuzz: () => void;
}) {
  const t = useTranslations('meet.call.quizArena');
  useEffect(() => {
    if (disabled) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.code !== 'Space' ||
        event.repeat ||
        target?.closest(
          'input, textarea, select, button, [contenteditable="true"]'
        )
      )
        return;
      event.preventDefault();
      onBuzz();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [disabled, onBuzz]);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onBuzz}
      className="mx-auto my-1.5 grid size-40 place-items-center rounded-full bg-primary font-extrabold text-2xl text-primary-foreground shadow-lg ring-8 ring-primary/10 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4 enabled:active:scale-95 disabled:opacity-50 motion-safe:transition-transform motion-reduce:transition-none"
    >
      <span>
        {t('buzz')}
        <small className="block font-bold text-xs opacity-70">
          {t('buzz_hint')}
        </small>
      </span>
    </button>
  );
}
