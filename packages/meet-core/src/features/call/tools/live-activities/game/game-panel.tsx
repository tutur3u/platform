'use client';

import { ChevronRight, Eye, Flag, Gamepad2, RotateCcw } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { ToolAction } from '../../tool-ui';
import { ActivityEmpty, ActivityNotice, useActivity } from '../activity-kit';
import type { MeetToolPanelProps } from '../meet-tool';
import { LiveActivityPanelFrame } from '../panel-frame';
import { GameRound, GameScoreboard } from './game-round';
import { GameRoundsEditor, useGameRoundsDraft } from './game-rounds-editor';

/**
 * A quick multiple-choice game the room plays together. The host prepares the
 * rounds and paces them; players answer once per round and score on reveal.
 */
export function GamePanel({ onClose }: MeetToolPanelProps) {
  const activity = useActivity();
  const t = useTranslations('meet.call.live_activities.game');
  const { game } = activity.snapshot;
  const rounds = activity.host?.game.rounds ?? [];
  // Held here, not in the editor: the editor leaves the screen while a game
  // runs, and the host's unsaved rounds must still be there when it ends.
  const draft = useGameRoundsDraft(rounds);
  const last = !!game.round && game.round.index + 1 >= game.round.total;
  // Reveal and Next name the round on screen, so the room can refuse one that
  // arrives after the game moved on.
  const roundId = game.round?.id;
  return (
    <LiveActivityPanelFrame
      title={t('title')}
      icon={Gamepad2}
      subtitle={t(`phase_${game.phase}`)}
      onClose={onClose}
    >
      {game.phase === 'idle' ? (
        activity.canManage ? (
          <GameRoundsEditor draft={draft} saved={rounds} send={activity.send} />
        ) : (
          <ActivityEmpty>{t('empty_participant')}</ActivityEmpty>
        )
      ) : (
        <>
          {game.phase === 'done' ? (
            <p role="status" className="font-semibold text-sm">
              {t('finished')}
            </p>
          ) : (
            <GameRound activity={activity} />
          )}
          {activity.canManage && (
            <div className="flex flex-wrap items-center gap-2">
              {game.phase === 'question' && (
                <ToolAction
                  icon={Eye}
                  label={t('reveal')}
                  variant="default"
                  onClick={() =>
                    roundId && activity.send({ kind: 'game.reveal', roundId })
                  }
                />
              )}
              {game.phase === 'reveal' && (
                <ToolAction
                  icon={last ? Flag : ChevronRight}
                  label={t(last ? 'finish' : 'next_round')}
                  variant="default"
                  onClick={() =>
                    roundId && activity.send({ kind: 'game.next', roundId })
                  }
                />
              )}
              <ToolAction
                icon={RotateCcw}
                label={t(game.phase === 'done' ? 'play_again' : 'end_game')}
                variant={game.phase === 'done' ? 'default' : 'ghost'}
                onClick={() => activity.send({ kind: 'game.reset' })}
              />
            </div>
          )}
          {game.phase !== 'question' && <GameScoreboard activity={activity} />}
        </>
      )}
      <ActivityNotice error={activity.error} stale={activity.stale} />
    </LiveActivityPanelFrame>
  );
}
