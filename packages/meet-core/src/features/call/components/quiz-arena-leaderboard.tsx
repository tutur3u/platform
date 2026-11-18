'use client';

import { CircleCheck } from '@tuturuuu/icons';
import {
  type QuizArenaFullView,
  rankQuizArenaPlayers,
  rankQuizArenaTeams,
} from '@tuturuuu/realtime/meet/room-quiz-arena';
import { cn } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { arenaColor, colorFor, Swatch } from './quiz-arena-kit';

type Row = {
  key: string;
  rank: number;
  name: string;
  score: number;
  delta: number;
  color: string;
  bar: string;
  me: boolean;
  credited?: boolean;
};

export function QuizArenaLeaderboard({
  view,
  selfId,
}: {
  view: QuizArenaFullView;
  selfId: string;
}) {
  const t = useTranslations('meet.call.quizArena');
  const locale = useLocale();
  const teams = view.meta.playMode === 'teams';
  const [tab, setTab] = useState<'teams' | 'individual'>(
    teams ? 'teams' : 'individual'
  );
  const showTeams = teams && tab === 'teams';
  const format = new Intl.NumberFormat(locale);
  const delta = new Intl.NumberFormat(locale, { signDisplay: 'exceptZero' });
  const me = view.players.find((p) => p.userId === selfId);
  const rows: Row[] = showTeams
    ? rankQuizArenaTeams(view.teams).map((team) => {
        const color = arenaColor(
          view.teams.findIndex(({ id }) => id === team.id)
        );
        return {
          key: team.id,
          rank: team.rank,
          name: `${team.name} · ${team.memberCount}`,
          score: team.score,
          delta: team.lastDelta,
          color: color.chip,
          bar: color.bar,
          me: team.id === me?.teamId,
        };
      })
    : rankQuizArenaPlayers(view.players).map((player) => {
        const color = colorFor(player.userId);
        return {
          key: player.userId,
          rank: player.rank,
          name:
            player.userId === selfId
              ? `${t('you')} · ${player.displayName}`
              : player.displayName,
          score: player.score,
          delta: player.lastDelta,
          color: color.chip,
          bar: color.bar,
          me: player.userId === selfId,
          credited: player.attendanceCredited,
        };
      });
  const top = Math.max(1, ...rows.map(({ score }) => score));
  return (
    <section aria-label={t('leaderboard')} className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="font-extrabold text-base">{t('leaderboard')}</h3>
        {teams && (
          <div
            role="tablist"
            className="ml-auto inline-flex rounded-full bg-muted p-0.5"
          >
            {(['teams', 'individual'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={cn(
                  'h-7 rounded-full px-3 font-bold text-xs focus-visible:outline-2 focus-visible:outline-ring',
                  tab === value
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground'
                )}
              >
                {value === 'teams'
                  ? t('leaderboard_teams')
                  : t('leaderboard_individual')}
              </button>
            ))}
          </div>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('no_players')}</p>
      ) : (
        <ol className="max-h-80 space-y-0.5 overflow-y-auto">
          {rows.map((row) => (
            <li
              key={row.key}
              aria-current={row.me || undefined}
              className={cn(
                'grid grid-cols-[22px_28px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl px-2.5 py-2',
                row.rank === 1 && row.score > 0 && 'bg-dynamic-yellow/10',
                row.me && 'bg-muted'
              )}
            >
              <span className="text-center font-extrabold font-mono text-muted-foreground text-xs">
                {row.rank}
              </span>
              <Swatch label={row.name} color={row.color} />
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-1">
                  <span className="truncate font-extrabold text-sm">
                    {row.name}
                  </span>
                  {row.credited && (
                    <CircleCheck
                      aria-label={t('attendance_credit')}
                      className="size-3.5 shrink-0 text-dynamic-green"
                    />
                  )}
                </div>
                <div
                  aria-hidden
                  className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className={cn(
                      'h-full rounded-full motion-safe:transition-[width] motion-safe:duration-300 motion-reduce:transition-none',
                      row.bar
                    )}
                    style={{
                      width: `${Math.max(0, (100 * row.score) / top)}%`,
                    }}
                  />
                </div>
              </div>
              <div className="text-right">
                <div className="font-extrabold font-mono text-sm tabular-nums">
                  {format.format(row.score)}
                </div>
                {row.delta !== 0 && (
                  <div
                    className={cn(
                      'font-extrabold text-xs tabular-nums',
                      row.delta > 0 ? 'text-dynamic-green' : 'text-dynamic-red'
                    )}
                  >
                    {delta.format(row.delta)}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
