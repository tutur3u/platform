'use client';

import { useCallPolls } from '../lib/polls-client';
import { useCallQuizArena } from '../lib/quiz-arena-client';
import { PollsControl, PollsPanel } from './polls-panel';
import { QuizArenaControl, QuizArenaPanel } from './quiz-arena-panel';

export type ActivityDrawer = 'polls' | 'quiz-arena';

/** Classroom activities share one drawer slot and one control group. */
export function useCallActivities<D extends string | null>({
  meetingId,
  accountId,
  enabled,
  drawer,
  onDrawer,
}: {
  meetingId: string;
  accountId: string;
  enabled: boolean;
  drawer: D;
  onDrawer: (next: ActivityDrawer | null) => void;
}) {
  const polls = useCallPolls(meetingId, accountId, enabled, drawer === 'polls');
  const arena = useCallQuizArena(
    meetingId,
    accountId,
    enabled,
    drawer === 'quiz-arena'
  );
  const toggle = (next: ActivityDrawer) =>
    onDrawer(drawer === next ? null : next);
  const close = () => onDrawer(null);
  return {
    controls: (
      <>
        <PollsControl
          query={polls}
          open={drawer === 'polls'}
          onClick={() => toggle('polls')}
        />
        <QuizArenaControl
          query={arena}
          open={drawer === 'quiz-arena'}
          onClick={() => toggle('quiz-arena')}
        />
      </>
    ),
    panel:
      drawer === 'polls' ? (
        <PollsPanel
          accountId={accountId}
          meetingId={meetingId}
          query={polls}
          onClose={close}
        />
      ) : drawer === 'quiz-arena' ? (
        <QuizArenaPanel
          accountId={accountId}
          meetingId={meetingId}
          query={arena}
          onClose={close}
        />
      ) : null,
  };
}
