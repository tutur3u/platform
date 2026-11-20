'use client';

import { ClipboardList } from '@tuturuuu/icons';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ClassroomControls } from '../../classroom-tools/classroom-controls';
import type { ClassroomTool } from '../../classroom-tools/classroom-client';
import { ClassroomPanel } from '../../classroom-tools/classroom-panel';
import { useCallPolls } from '../lib/polls-client';
import { useCallQuizArena } from '../lib/quiz-arena-client';
import { AccountRequiredState } from './account-required-state';
import { ControlButton } from './control-bar';
import { PollsControl, PollsPanel } from './polls-panel';
import { QuizArenaControl, QuizArenaPanel } from './quiz-arena-panel';
import { ResizableCallPanel } from './resizable-call-panel';

const MeetFormsActivity = dynamic(
  () =>
    import('./forms/meet-forms-activity').then(
      (module) => module.MeetFormsActivity
    ),
  { ssr: false }
);

export type ActivityDrawer = 'polls' | 'quiz-arena' | 'forms' | ClassroomTool;

/** Classroom activities share one drawer slot and one control group. */
export function useCallActivities<D extends string | null>({
  meetingId,
  accountId,
  enabled,
  classroomToolsEnabled = false,
  showTools = true,
  formsEnabled,
  formsTurnstileSiteKey,
  formsAccess,
  drawer,
  onDrawer,
  requiresAccount = false,
}: {
  meetingId: string;
  accountId: string;
  enabled: boolean;
  classroomToolsEnabled?: boolean;
  showTools?: boolean;
  formsEnabled: boolean;
  formsTurnstileSiteKey?: string;
  formsAccess: { canManage: boolean; canReadWorkspace: boolean };
  drawer: D;
  onDrawer: (next: ActivityDrawer | null) => void;
  /** Anonymous guests may vote in polls only; Quiz Arena needs an account. */
  requiresAccount?: boolean;
}) {
  const t = useTranslations('meet.call.quizArena');
  const formsT = useTranslations('meet.call');
  const [hasOpenedForms, setHasOpenedForms] = useState(false);
  const canUseForms = enabled && formsEnabled && !requiresAccount;
  const classroomAvailable = enabled && classroomToolsEnabled;
  const polls = useCallPolls(meetingId, accountId, enabled, drawer === 'polls');
  const arena = useCallQuizArena(
    meetingId,
    accountId,
    enabled,
    drawer === 'quiz-arena'
  );
  const toggle = (next: ActivityDrawer) => {
    if (next === 'forms') setHasOpenedForms(true);
    onDrawer(drawer === next ? null : next);
  };
  const close = () => onDrawer(null);
  const activePoll = polls.data?.polls.some((poll) => poll.status === 'active');
  const activeArena =
    arena.data?.kind === 'full' &&
    ['lobby', 'question', 'reveal', 'final_wager', 'final_answer'].includes(
      arena.data.meta.phase
    );
  const showPolls = showTools || activePoll;
  const showArena = showTools || activeArena;
  const liveControl = activePoll ? (
    <PollsControl
      query={polls}
      open={drawer === 'polls'}
      onClick={() => toggle('polls')}
    />
  ) : activeArena ? (
    <QuizArenaControl
      query={arena}
      open={drawer === 'quiz-arena'}
      onClick={() => toggle('quiz-arena')}
    />
  ) : null;
  return {
    liveControl,
    controls: (
      <>
        {showPolls && (
          <PollsControl
            query={polls}
            open={drawer === 'polls'}
            onClick={() => toggle('polls')}
          />
        )}
        {classroomAvailable && (
          <ClassroomControls active={drawer} toggle={toggle} />
        )}
        {showArena && (
          <QuizArenaControl
            query={arena}
            open={drawer === 'quiz-arena'}
            onClick={() => toggle('quiz-arena')}
          />
        )}
        {canUseForms && (
          <ControlButton
            active={drawer === 'forms'}
            icon={ClipboardList}
            label={formsT('forms.title')}
            onClick={() => toggle('forms')}
          />
        )}
      </>
    ),
    panel: (
      <>
        {canUseForms && hasOpenedForms && (
          <MeetFormsActivity
            key={JSON.stringify([meetingId, accountId])}
            accountId={accountId}
            meetingId={meetingId}
            {...formsAccess}
            turnstileSiteKey={formsTurnstileSiteKey}
            open={drawer === 'forms'}
            onClose={close}
          />
        )}
        {classroomAvailable &&
          (drawer === 'whiteboard' || drawer === 'breakouts') && (
            <ClassroomPanel
              key={drawer}
              tool={drawer}
              accountId={accountId}
              meetingId={meetingId}
              close={close}
            />
          )}
        {drawer === 'polls' && showPolls ? (
          <PollsPanel
            accountId={accountId}
            meetingId={meetingId}
            query={polls}
            onClose={close}
          />
        ) : drawer === 'quiz-arena' && showArena ? (
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
        ) : null}
      </>
    ),
  };
}
