'use client';

import { Timer } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import {
  type Activity,
  ActivitySection,
  activityCardClass,
} from '../activity-kit';
import { ChoiceGroup } from '../choice-group';

/** Whole seconds until the round's deadline, ticking only while it runs. */
function useSecondsLeft(endsAt: number | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endsAt === undefined) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [endsAt]);
  return endsAt === undefined
    ? 0
    : Math.max(0, Math.ceil((endsAt - now) / 1000));
}

/** The live round: players answer once before the deadline, then see the key. */
export function GameRound({ activity }: { activity: Activity }) {
  const t = useTranslations('meet.call.live_activities.game');
  const { game } = activity.snapshot;
  const round = game.round;
  const question = game.phase === 'question';
  const seconds = useSecondsLeft(question ? round?.endsAt : undefined);
  if (!round) return null;
  const mine =
    activity.mine.game.roundId === round.id
      ? activity.mine.game.choice
      : undefined;
  const canAnswer =
    question && seconds > 0 && mine === undefined && !activity.canManage;
  return (
    <div className={activityCardClass}>
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <span className="flex-1 font-semibold">
          {t('round_of', { current: round.index + 1, total: round.total })}
        </span>
        {question && (
          <span
            role="timer"
            aria-label={t('seconds_left', { seconds })}
            className="inline-flex items-center gap-1 tabular-nums"
          >
            <Timer aria-hidden="true" className="size-3.5" />
            {seconds}
          </span>
        )}
      </div>
      <p className="wrap-break-word font-semibold text-base">{round.prompt}</p>
      <ChoiceGroup
        id={round.id}
        label={round.prompt}
        options={round.options}
        selected={mine}
        correct={round.correct}
        onSelect={
          canAnswer
            ? (choice) =>
                activity.send({
                  kind: 'game.answer',
                  roundId: round.id,
                  choice,
                })
            : undefined
        }
      />
      <p role="status" className="text-muted-foreground text-sm">
        {activity.canManage
          ? t('answered', { count: game.answered })
          : !question
            ? mine === undefined
              ? t('no_answer')
              : t(mine === round.correct ? 'right' : 'wrong')
            : mine !== undefined
              ? t('locked_in')
              : seconds > 0
                ? t('pick_one')
                : t('time_up')}
      </p>
    </div>
  );
}

/** Points so far, best first. */
export function GameScoreboard({ activity }: { activity: Activity }) {
  const t = useTranslations('meet.call.live_activities.game');
  const { scores } = activity.snapshot.game;
  if (!scores.length) return null;
  return (
    <ActivitySection title={t('scoreboard')}>
      <ol className="space-y-1 text-sm">
        {scores.slice(0, 20).map((entry, index) => (
          <li key={entry.participantId} className="flex items-center gap-2">
            <span className="w-5 text-right text-muted-foreground tabular-nums">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1 truncate">
              {activity.nameOf(entry.participantId)}
            </span>
            <span className="font-semibold tabular-nums">{entry.score}</span>
          </li>
        ))}
      </ol>
    </ActivitySection>
  );
}
