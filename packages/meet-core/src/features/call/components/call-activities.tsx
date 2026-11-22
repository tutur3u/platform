'use client';

import { ClipboardList, LayoutGrid, PenTool } from '@tuturuuu/icons';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { type ComponentType, useState } from 'react';
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

/** An activity the Activities menu lists beside the registered tools. */
export type ActivityEntry = {
  id: ActivityDrawer;
  label: string;
  icon: ComponentType<{ className?: string }>;
  active: boolean;
  toggle: () => void;
};

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
  const classroomT = useTranslations('meet.classroom_tools');
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
  // With the Activities menu in use (`showTools` off) these open from its
  // grid; otherwise they stay rows in More.
  const entries: ActivityEntry[] = [
    ...(classroomAvailable
      ? [
          {
            id: 'whiteboard' as const,
            label: classroomT('whiteboard.title'),
            icon: PenTool,
            active: drawer === 'whiteboard',
            toggle: () => toggle('whiteboard'),
          },
          {
            id: 'breakouts' as const,
            label: classroomT('breakouts.title'),
            icon: LayoutGrid,
            active: drawer === 'breakouts',
            toggle: () => toggle('breakouts'),
          },
        ]
      : []),
    ...(canUseForms
      ? [
          {
            id: 'forms' as const,
            label: formsT('forms.title'),
            icon: ClipboardList,
            active: drawer === 'forms',
            toggle: () => toggle('forms'),
          },
        ]
      : []),
  ];
  return {
    liveControl,
    entries,
    controls: (
      <>
        {showPolls && (
          <PollsControl
            query={polls}
            open={drawer === 'polls'}
            onClick={() => toggle('polls')}
          />
        )}
        {showTools && classroomAvailable && (
          <ClassroomControls active={drawer} toggle={toggle} />
        )}
        {showArena && (
          <QuizArenaControl
            query={arena}
            open={drawer === 'quiz-arena'}
            onClick={() => toggle('quiz-arena')}
          />
        )}
        {showTools && canUseForms && (
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
