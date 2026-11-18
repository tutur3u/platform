'use client';

import { Eye, Flag, RotateCcw, SkipForward, Trophy } from '@tuturuuu/icons';
import type { QuizArenaFullView } from '@tuturuuu/realtime/meet/room-quiz-arena';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Switch } from '@tuturuuu/ui/switch';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import type { QuizArenaAction } from '../server/quiz-arena';

export function QuizArenaHostControls({
  view,
  busy,
  onAction,
  onNewBoard,
}: {
  view: QuizArenaFullView;
  busy: boolean;
  onAction: (action: QuizArenaAction) => void;
  onNewBoard: () => void;
}) {
  const t = useTranslations('meet.call.quizArena');
  const locale = useLocale();
  const { meta } = view;
  const lockId = useId();
  const teams = meta.playMode === 'teams';
  const targets = teams
    ? view.teams.map((team) => ({
        value: `team:${team.id}`,
        label: team.name,
        score: team.score,
      }))
    : view.players.map((player) => ({
        value: `player:${player.userId}`,
        label: player.displayName,
        score: player.score,
      }));
  const [target, setTarget] = useState('');
  const [custom, setCustom] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const selected = targets.find(({ value }) => value === target) ?? targets[0];
  const activeId = meta.activeTileId;
  const active =
    view.tiles.find(({ id }) => id === activeId) ??
    (view.finalTile?.id === activeId ? view.finalTile : undefined);
  const format = new Intl.NumberFormat(locale);
  const adjust = (value: number) => {
    if (!selected || !Number.isFinite(value) || value === 0) return;
    const [type, id = ''] = selected.value.split(/:(.*)/su);
    onAction({
      action: 'adjustPoints',
      target:
        type === 'team'
          ? { type: 'team', teamId: id }
          : { type: 'player', userId: id },
      mode: 'delta',
      value,
    });
  };
  const step = active?.points ?? meta.tierPoints[0] ?? 100;
  return (
    <section
      aria-label={t('host_controls')}
      className="space-y-3 rounded-2xl bg-muted/50 p-3"
    >
      <h3 className="font-extrabold text-base">{t('host_controls')}</h3>
      {meta.answerMode === 'buzz_in' && meta.phase === 'question' && (
        <div className="flex items-center gap-3">
          <label htmlFor={lockId} className="min-w-0 flex-1">
            <b className="block text-sm">{t('lock_buzzers')}</b>
            <span className="text-muted-foreground text-xs">
              {t('lock_buzzers_hint')}
            </span>
          </label>
          <Switch
            id={lockId}
            checked={meta.buzzersLocked}
            disabled={busy}
            onCheckedChange={(locked) =>
              onAction({ action: 'lockBuzzers', locked })
            }
          />
        </div>
      )}
      {selected && meta.phase !== 'ended' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <b className="text-sm">{t('adjust_points')}</b>
            <Select value={selected.value} onValueChange={setTarget}>
              <SelectTrigger
                aria-label={t('adjust_target')}
                className="ml-auto h-8 max-w-44"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {targets.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {`${item.label} · ${format.format(item.score)}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="tabular-nums"
              disabled={busy}
              onClick={() => adjust(-step)}
            >
              {`−${format.format(step)}`}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="tabular-nums"
              disabled={busy}
              onClick={() => adjust(step)}
            >
              {`+${format.format(step)}`}
            </Button>
            <form
              className="flex min-w-0 flex-1 gap-1.5"
              onSubmit={(event) => {
                event.preventDefault();
                adjust(Math.trunc(Number(custom)));
                setCustom('');
              }}
            >
              <Input
                aria-label={t('custom_points')}
                placeholder={t('custom_points')}
                inputMode="numeric"
                pattern="-?[0-9]*"
                className="h-8 min-w-0"
                value={custom}
                onChange={(event) => setCustom(event.target.value)}
              />
              <Button
                size="sm"
                type="submit"
                variant="outline"
                disabled={busy || !custom}
              >
                {t('apply')}
              </Button>
            </form>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {meta.phase === 'question' && active && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              disabled={busy}
              onClick={() =>
                onAction({ action: 'skipTile', tileId: active.id })
              }
            >
              <SkipForward className="size-4" />
              {t('skip')}
            </Button>
            <Button
              size="sm"
              className="flex-1"
              disabled={busy}
              onClick={() =>
                onAction({ action: 'revealTile', tileId: active.id })
              }
            >
              <Eye className="size-4" />
              {t('reveal')}
            </Button>
          </>
        )}
        {meta.phase === 'board' && view.finalTile?.status === 'available' && (
          <Button
            size="sm"
            className="flex-1"
            disabled={busy}
            onClick={() =>
              onAction({ action: 'startFinalRound', stage: 'wager' })
            }
          >
            <Flag className="size-4" />
            {t('start_final')}
          </Button>
        )}
        {meta.phase === 'final_wager' && (
          <Button
            size="sm"
            className="flex-1"
            disabled={busy}
            onClick={() =>
              onAction({ action: 'startFinalRound', stage: 'answer' })
            }
          >
            <Flag className="size-4" />
            {t('open_final_answers')}
          </Button>
        )}
        {meta.phase === 'final_answer' && view.finalTile && (
          <Button
            size="sm"
            className="flex-1"
            disabled={busy}
            onClick={() =>
              onAction({ action: 'revealTile', tileId: view.finalTile!.id })
            }
          >
            <Eye className="size-4" />
            {t('reveal_final')}
          </Button>
        )}
        {meta.phase !== 'ended' && (
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            disabled={busy}
            onClick={() => onAction({ action: 'endGame' })}
          >
            <Trophy className="size-4" />
            {t('end_game')}
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 border-border border-t pt-2">
        {confirmReset ? (
          <>
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => {
                setConfirmReset(false);
                onAction({ action: 'reset' });
              }}
            >
              {t('confirm_reset')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmReset(false)}
            >
              {t('cancel')}
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => setConfirmReset(true)}
          >
            <RotateCcw className="size-4" />
            {t('reset')}
          </Button>
        )}
        {(meta.phase === 'board' || meta.phase === 'ended') && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={onNewBoard}
          >
            {t('new_board')}
          </Button>
        )}
      </div>
    </section>
  );
}
