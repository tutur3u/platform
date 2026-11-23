'use client';

import {
  CodeXml,
  FileText,
  LayoutGrid,
  PenTool,
  Presentation,
} from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { MeetToolDefinition } from '../tools/registry';
import {
  BOARD_ACTIVITY,
  CLASSROOM_ACTIVITIES,
  DOCUMENT_ACTIVITY,
  PROGRAMMING_ACTIVITY,
  toolIdOf,
} from './activity-ids';
import { type StageActivity, StageLayoutView } from './stage-layout-view';
import type { StageLayoutController } from './use-stage-layout';

/**
 * The call's stage: every open activity in the layout manager beside the
 * people. It names each activity and asks the call for its content.
 */
export function RoomStage({
  controller,
  stage,
  peopleCount,
  tools,
  renderTool,
  renderClassroom,
  renderCollaboration,
}: {
  controller: StageLayoutController;
  stage: ReactNode;
  peopleCount: number;
  tools: readonly MeetToolDefinition[];
  renderTool: (activityId: string) => ReactNode;
  renderClassroom: (activityId: string) => ReactNode;
  renderCollaboration: (activityId: string) => ReactNode;
}) {
  const all = useTranslations();
  const classroomT = useTranslations('meet.classroom_tools');
  const programmingT = useTranslations('programmingPlayground');
  const collaborationT = useTranslations('meet.collaboration');
  const activities = controller.openIds.flatMap((id): StageActivity[] => {
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
  return (
    <StageLayoutView
      controller={controller}
      activities={activities}
      stage={stage}
      peopleCount={peopleCount}
    />
  );
}
