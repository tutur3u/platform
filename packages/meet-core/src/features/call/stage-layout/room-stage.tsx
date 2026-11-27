'use client';

import {
  CodeXml,
  FileText,
  LayoutGrid,
  PenTool,
  Presentation,
  Timer,
} from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { type RoomTimer, RoomTimerProvider } from '../components/timer-modes';
import { useMeetCallUx } from '../prejoin/use-meet-call-ux';
import type { MeetToolDefinition } from '../tools/registry';
import {
  BOARD_ACTIVITY,
  CLASSROOM_ACTIVITIES,
  DOCUMENT_ACTIVITY,
  PROGRAMMING_ACTIVITY,
  toolIdOf,
} from './activity-ids';
import type { ActivityPresencePerson } from './activity-presence';
import { mergedKindOf } from './merged-activities';
import { type StageActivity, StageLayoutView } from './stage-layout-view';
import type { ActivityPresentation } from './use-activity-presentation';
import type { StageLayoutController } from './use-stage-layout';

/**
 * The call's stage: every open activity in the layout manager beside the
 * people. It names each activity and asks the call for its content.
 */
export function RoomStage({
  controller,
  stage,
  peopleCount,
  presentation,
  onCloseForEveryone,
  presenceByActivity,
  roomTimer = null,
  tools,
  renderTool,
  renderClassroom,
  renderCollaboration,
}: {
  controller: StageLayoutController;
  stage: ReactNode;
  peopleCount: number;
  presentation?: ActivityPresentation;
  onCloseForEveryone?: (activityId: string) => void;
  presenceByActivity?: Record<string, readonly ActivityPresencePerson[]>;
  /** Meet UX v2's room timer, for the one Timer pane. */
  roomTimer?: RoomTimer | null;
  tools: readonly MeetToolDefinition[];
  renderTool: (activityId: string) => ReactNode;
  renderClassroom: (activityId: string) => ReactNode;
  renderCollaboration: (activityId: string) => ReactNode;
}) {
  const all = useTranslations();
  const classroomT = useTranslations('meet.classroom_tools');
  const programmingT = useTranslations('programmingPlayground');
  const collaborationT = useTranslations('meet.collaboration');
  const activitiesT = useTranslations('meet.call.activities');
  const merged = useMeetCallUx();
  const named = controller.openIds.flatMap((id): StageActivity[] => {
    if (id === PROGRAMMING_ACTIVITY)
      return [
        {
          id,
          title: programmingT('coding'),
          icon: CodeXml,
          content: renderCollaboration(id),
        },
      ];
    if (id === DOCUMENT_ACTIVITY)
      return [
        {
          id,
          title: collaborationT('document'),
          icon: FileText,
          content: renderCollaboration(id),
        },
      ];
    if (id === BOARD_ACTIVITY)
      return [
        {
          id,
          title: collaborationT('board'),
          icon: Presentation,
          content: renderCollaboration(id),
        },
      ];
    const toolId = toolIdOf(id);
    if (toolId) {
      const tool = tools.find((entry) => entry.id === toolId);
      if (!tool) return [];
      return [
        {
          id,
          title: all.has(tool.label) ? all(tool.label) : tool.label,
          icon: tool.icon,
          content: renderTool(id),
        },
      ];
    }
    if ((CLASSROOM_ACTIVITIES as readonly string[]).includes(id))
      return [
        {
          id,
          title: classroomT(`${id as 'whiteboard' | 'breakouts'}.title`),
          icon: id === 'whiteboard' ? PenTool : LayoutGrid,
          content: renderClassroom(id),
        },
      ];
    return [];
  });
  // Meet UX v2 names each older whiteboard and timer pane after the one
  // Whiteboard or Timer it now belongs to, in its title, chip and switcher.
  const activities = merged
    ? named.map((activity) => {
        const kind = mergedKindOf(activity.id);
        if (!kind) return activity;
        return {
          ...activity,
          title: activitiesT(`merged.${kind}`),
          icon: kind === 'whiteboard' ? PenTool : Timer,
        };
      })
    : named;
  return (
    <RoomTimerProvider value={roomTimer}>
      <StageLayoutView
        controller={controller}
        activities={activities}
        stage={stage}
        peopleCount={peopleCount}
        presentation={presentation}
        onCloseForEveryone={onCloseForEveryone}
        presenceByActivity={presenceByActivity}
      />
    </RoomTimerProvider>
  );
}
