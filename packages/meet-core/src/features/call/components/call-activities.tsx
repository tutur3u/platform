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
import { ControlButton } from './control-bar';
import { PollsControl } from './polls-panel';
import { QuizArenaControl } from './quiz-arena-panel';
import type { ActivityStage } from '../stage-layout/activity-ids';
import { toolActivityId } from '../stage-layout/activity-ids';

const MeetFormsActivity = dynamic(
  () =>
    import('./forms/meet-forms-activity').then(
      (module) => module.MeetFormsActivity
    ),
  { ssr: false }
);

export type ActivityDrawer = 'polls' | 'quiz-arena' | 'forms' | ClassroomTool;

/** Stage ids for the activities the shortcuts and the classroom tools open. */
const stageIdOf = (activity: Exclude<ActivityDrawer, 'forms'>) =>
  activity === 'polls'
    ? toolActivityId('polls')
    : activity === 'quiz-arena'
      ? toolActivityId('quiz')
      : activity;

/** An activity the Activities menu lists beside the registered tools. */
export type ActivityEntry = {
  id: ActivityDrawer;
  label: string;
  icon: ComponentType<{ className?: string }>;
  active: boolean;
  toggle: () => void;
};

/** Classroom activities share one drawer slot and one control group. */
export function useCallActivities({
  meetingId,
  accountId,
  enabled,
  classroomToolsEnabled = false,
  showTools = true,
  formsEnabled,
  formsTurnstileSiteKey,
  formsAccess,
  stage,
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
  stage: ActivityStage;
  /** Anonymous guests may vote in polls only; Quiz Arena needs an account. */
  requiresAccount?: boolean;
}) {
  const formsT = useTranslations('meet.call');
  const classroomT = useTranslations('meet.classroom_tools');
  // In-call forms are a dialog, not a pane.
  const [formsOpen, setFormsOpen] = useState(false);
  const isOpen = (activity: ActivityDrawer) =>
    activity === 'forms' ? formsOpen : stage.isOpen(stageIdOf(activity));
  const canUseForms = enabled && formsEnabled && !requiresAccount;
  const classroomAvailable = enabled && classroomToolsEnabled;
  const polls = useCallPolls(meetingId, accountId, enabled, isOpen('polls'));
  const arena = useCallQuizArena(
    meetingId,
    accountId,
    enabled,
    isOpen('quiz-arena')
  );
  const toggle = (next: ActivityDrawer) => {
    if (next === 'forms') setFormsOpen((open) => !open);
    else stage.toggle(stageIdOf(next));
  };
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
      open={isOpen('polls')}
      onClick={() => toggle('polls')}
    />
  ) : activeArena ? (
    <QuizArenaControl
      query={arena}
      open={isOpen('quiz-arena')}
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
            active: isOpen('whiteboard'),
            toggle: () => toggle('whiteboard'),
          },
          {
            id: 'breakouts' as const,
            label: classroomT('breakouts.title'),
            icon: LayoutGrid,
            active: isOpen('breakouts'),
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
            active: isOpen('forms'),
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
            open={isOpen('polls')}
            onClick={() => toggle('polls')}
          />
        )}
        {showTools && classroomAvailable && (
          <ClassroomControls
            active={(['whiteboard', 'breakouts'] as const).find(isOpen) ?? null}
            toggle={toggle}
          />
        )}
        {showArena && (
          <QuizArenaControl
            query={arena}
            open={isOpen('quiz-arena')}
            onClick={() => toggle('quiz-arena')}
          />
        )}
        {showTools && canUseForms && (
          <ControlButton
            active={isOpen('forms')}
            icon={ClipboardList}
            label={formsT('forms.title')}
            onClick={() => toggle('forms')}
          />
        )}
      </>
    ),
    /** The in-call forms dialog; it renders over the room, not in a pane. */
    dialog:
      canUseForms && formsOpen ? (
        <MeetFormsActivity
          key={JSON.stringify([meetingId, accountId])}
          accountId={accountId}
          meetingId={meetingId}
          {...formsAccess}
          turnstileSiteKey={formsTurnstileSiteKey}
          open
          onClose={() => setFormsOpen(false)}
        />
      ) : null,
    /** The pane content for a classroom activity or a live quiz arena. */
    renderPanel: (activity: string) => {
      if (
        classroomAvailable &&
        (activity === 'whiteboard' || activity === 'breakouts')
      )
        return (
          <ClassroomPanel
            key={activity}
            tool={activity}
            accountId={accountId}
            meetingId={meetingId}
            close={() => stage.close(activity)}
          />
        );
      return null;
    },
  };
}
