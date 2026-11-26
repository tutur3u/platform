'use client';

import { QuizArenaPanel } from '../../components/quiz-arena-panel';
import { useCallQuizArena } from '../../lib/quiz-arena-client';
import { useMeetTool } from '../context';

export function QuizToolPanel() {
  const { meetingId, accountId, enabled, requiresAccount, close } =
    useMeetTool();
  const query = useCallQuizArena(meetingId, accountId, enabled, true);
  return (
    <QuizArenaPanel
      accountId={accountId}
      meetingId={meetingId}
      guest={requiresAccount}
      query={query}
      onClose={close}
    />
  );
}
