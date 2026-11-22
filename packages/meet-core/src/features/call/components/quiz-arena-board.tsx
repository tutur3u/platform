'use client';

import { Shuffle, Zap } from '@tuturuuu/icons';
import type {
  ProjectedArenaTile,
  QuizArenaFullView,
} from '@tuturuuu/realtime/meet/room-quiz-arena';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { arenaColor, MiraLiveTag, Pill } from './quiz-arena-kit';

/** The team that earned the most on a played tile, for its tint. */
function winningTeam(view: QuizArenaFullView, tile: ProjectedArenaTile) {
  if (tile.status !== 'revealed' || view.meta.playMode !== 'teams') return null;
  const byTeam = new Map<string, number>();
  for (const answer of tile.answers ?? [])
    if (answer.delta > 0) {
      const teamId = view.players.find(
        (p) => p.userId === answer.userId
      )?.teamId;
      if (teamId) byTeam.set(teamId, (byTeam.get(teamId) ?? 0) + answer.delta);
    }
  const best = [...byTeam].sort((a, b) => b[1] - a[1])[0]?.[0];
  return best ? view.teams.findIndex(({ id }) => id === best) : null;
}

export function QuizArenaBoard({
  view,
  busy,
  onPick,
}: {
  view: QuizArenaFullView;
  busy: boolean;
  onPick: (tileId: string) => void;
}) {
  const t = useTranslations('meet.call.quizArena');
  const { meta, canManage } = view;
  const columns = meta.categories.length;
  const left = view.tiles.filter(({ status }) => status === 'available');
  const choosing = canManage && meta.phase === 'board';
  const cell = (category: number, tier: number) =>
    view.tiles.find(
      (tile) => tile.categoryIndex === category && tile.tierIndex === tier
    );
  return (
    <section aria-label={t('board')} className="space-y-2">
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {meta.categories.map((category) => (
          <div
            key={category}
            className="min-w-0 rounded-xl bg-muted px-1.5 py-2 text-center"
          >
            <b className="line-clamp-2 break-words font-extrabold text-xs text-foreground leading-tight">
              {category}
            </b>
          </div>
        ))}
        {meta.tierPoints.flatMap((points, tier) =>
          meta.categories.map((category, column) => {
            const tile = cell(column, tier);
            if (!tile)
              return (
                <span key={`${column}:${tier}`} aria-hidden className="h-12" />
              );
            const active = tile.status === 'active';
            const played =
              tile.status === 'revealed' || tile.status === 'skipped';
            const team = winningTeam(view, tile);
            const mira = active && meta.pickedBy === 'mira';
            const label = t('tile_label', { category, points: tile.points });
            const status =
              tile.status === 'revealed'
                ? t('tile_revealed')
                : tile.status === 'skipped'
                  ? t('tile_skipped')
                  : active
                    ? t('tile_active')
                    : '';
            return (
              <button
                key={tile.id}
                type="button"
                aria-label={status ? `${label}, ${status}` : label}
                aria-current={active || undefined}
                disabled={!choosing || tile.status !== 'available' || busy}
                onClick={() => onPick(tile.id)}
                className={cn(
                  'relative grid h-12 min-w-0 place-items-center rounded-xl border border-border bg-background font-extrabold text-base text-foreground tabular-nums @min-[360px]:h-14 @min-[360px]:text-lg',
                  'motion-safe:transition-colors motion-reduce:transition-none',
                  choosing &&
                    tile.status === 'available' &&
                    'hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
                  !choosing && tile.status === 'available' && 'cursor-default',
                  active && !mira && 'border-2 border-primary',
                  mira &&
                    'border-2 border-dynamic-purple bg-dynamic-purple/10 text-dynamic-purple',
                  played && 'border-dashed bg-muted text-muted-foreground',
                  tile.status === 'skipped' && 'line-through',
                  team !== null &&
                    team >= 0 && ['ring-2 ring-inset', arenaColor(team).ring]
                )}
              >
                {played ? (
                  <span className="text-xs">{status}</span>
                ) : (
                  tile.points
                )}
                {tile.isBonusWager && (
                  <Zap
                    aria-hidden
                    className="absolute top-1 right-1 size-3.5 text-dynamic-yellow"
                  />
                )}
                {mira && (
                  <MiraLiveTag
                    label={t('mira_live')}
                    className="absolute -top-2.5 left-1/2 -translate-x-1/2"
                  />
                )}
              </button>
            );
          })
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold text-muted-foreground text-sm tabular-nums">
          {t('tiles_left', { count: left.length, total: view.tiles.length })}
        </span>
        {choosing && left.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            disabled={busy}
            onClick={() => {
              const pick = left[Math.floor(Math.random() * left.length)];
              if (pick) onPick(pick.id);
            }}
          >
            <Shuffle className="size-4" />
            {t('random_tile')}
          </Button>
        )}
        {!canManage && meta.phase === 'board' && (
          <Pill className="ml-auto bg-muted text-foreground">
            {t('host_choosing')}
          </Pill>
        )}
      </div>
    </section>
  );
}
