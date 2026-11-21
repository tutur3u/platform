'use client';

import { useTranslations } from 'next-intl';
import { AccountRequiredState } from '../../components/account-required-state';
import { QuizArenaPanel } from '../../components/quiz-arena-panel';
import { ResizableCallPanel } from '../../components/resizable-call-panel';
import { useCallQuizArena } from '../../lib/quiz-arena-client';
import { useMeetTool } from '../context';

function SignedInQuizPanel() {
  const { meetingId, accountId, enabled, close } = useMeetTool();
  const query = useCallQuizArena(meetingId, accountId, enabled, true);
  return (
    <QuizArenaPanel
      accountId={accountId}
      meetingId={meetingId}
      query={query}
      onClose={close}
    />
  );
}

/** Quiz Arena needs an account; anonymous guests see the sign-in state. */
export function QuizToolPanel() {
  const { requiresAccount } = useMeetTool();
  const t = useTranslations('meet.call.quizArena');
  if (!requiresAccount) return <SignedInQuizPanel />;
  return (
    <ResizableCallPanel label={t('title')}>
      <AccountRequiredState />
    </ResizableCallPanel>
  );
}
