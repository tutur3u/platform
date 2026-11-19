'use client';

import { useTranslations } from 'next-intl';
import { useCallPolls } from '../lib/polls-client';
import { useCallQuizArena } from '../lib/quiz-arena-client';
import { AccountRequiredState } from './account-required-state';
import { PollsControl, PollsPanel } from './polls-panel';
import { QuizArenaControl, QuizArenaPanel } from './quiz-arena-panel';
import { ResizableCallPanel } from './resizable-call-panel';

export type ActivityDrawer = 'polls' | 'quiz-arena';

/** Classroom activities share one drawer slot and one control group. */
export function useCallActivities<D extends string | null>({
  meetingId,
  accountId,
  enabled,
  drawer,
  onDrawer,
  requiresAccount = false,
}: {
  meetingId: string;
  accountId: string;
  enabled: boolean;
  drawer: D;
  onDrawer: (next: ActivityDrawer | null) => void;
  /** Anonymous guests may vote in polls only; Quiz Arena needs an account. */
  requiresAccount?: boolean;
}) {
  const t = useTranslations('meet.call.quizArena');
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
        requiresAccount ? (
          <ResizableCallPanel label={t('title')}>
            <AccountRequiredState />
          </ResizableCallPanel>
        ) : (
          <QuizArenaPanel
            accountId={accountId}
            meetingId={meetingId}
            query={arena}
            onClose={close}
          />
        )
      ) : null,
  };
}
