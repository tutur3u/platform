'use client';

import { ChevronRight, Eye, Flag, Gamepad2, RotateCcw } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { ToolAction } from '../../tool-ui';
import { ActivityEmpty, ActivityNotice, useActivity } from '../activity-kit';
import type { MeetToolPanelProps } from '../meet-tool';
import { LiveActivityPanelFrame } from '../panel-frame';
import { GameRound, GameScoreboard } from './game-round';
import { GameRoundsEditor } from './game-rounds-editor';

/**
 * A quick multiple-choice game the room plays together. The host prepares the
 * rounds and paces them; players answer once per round and score on reveal.
 */
export function GamePanel({ onClose }: MeetToolPanelProps) {
  const activity = useActivity();
  const t = useTranslations('meet.call.live_activities.game');
  const { game } = activity.snapshot;
  const rounds = activity.host?.game.rounds ?? [];
  const last = !!game.round && game.round.index + 1 >= game.round.total;
  return (
    <LiveActivityPanelFrame
      title={t('title')}
      icon={Gamepad2}
      subtitle={t(`phase_${game.phase}`)}
      onClose={onClose}
    >
      {game.phase === 'idle' ? (
        activity.canManage ? (
          <GameRoundsEditor
            // The room issues new ids on save; start again from what it stored.
            key={rounds.map(({ id }) => id).join(':')}
            saved={rounds}
            send={activity.send}
          />
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
                  onClick={() => activity.send({ kind: 'game.reveal' })}
                />
              )}
              {game.phase === 'reveal' && (
                <ToolAction
                  icon={last ? Flag : ChevronRight}
                  label={t(last ? 'finish' : 'next_round')}
                  variant="default"
                  onClick={() => activity.send({ kind: 'game.next' })}
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
      <ActivityNotice error={activity.error} />
    </LiveActivityPanelFrame>
  );
}
