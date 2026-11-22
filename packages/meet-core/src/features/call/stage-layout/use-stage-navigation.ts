'use client';

import { useRoomNavigation } from '../hooks/use-room-navigation';
import {
  DOCUMENT_ACTIVITY,
  PROGRAMMING_ACTIVITY,
  toolActivityId,
} from './activity-ids';
import type { StageLayoutController } from './use-stage-layout';

/**
 * Follow and Summon over the stage. The view a person shares is the
 * activity in their focused pane; a view brought to them opens that
 * activity or focuses the pane that already has it, and never closes the
 * activities they have open.
 */
export function useStageNavigation({
  room,
  stage,
  drawer,
  onDrawer,
  onBroughtIn,
  access,
}: {
  room: Parameters<typeof useRoomNavigation>[0]['room'];
  stage: Pick<StageLayoutController, 'focused' | 'open'>;
  drawer: string | null;
  onDrawer: (drawer: string | null) => void;
  /** A host or co-host opened a shared surface for this person. */
  onBroughtIn: () => void;
  access: Parameters<typeof useRoomNavigation>[0]['access'];
}) {
  return useRoomNavigation({
    room,
    surface: {
      programming: stage.focused === PROGRAMMING_ACTIVITY,
      document: stage.focused === DOCUMENT_ACTIVITY,
      tool: stage.focused?.startsWith(toolActivityId(''))
        ? stage.focused
        : null,
      drawer,
    },
    apply: (next, { forced }) => {
      if (forced && (next.programming || next.document)) onBroughtIn();
      const target = next.programming
        ? PROGRAMMING_ACTIVITY
        : next.document
          ? DOCUMENT_ACTIVITY
          : next.tool;
      if (target) stage.open(target);
      onDrawer(next.drawer);
    },
    access,
  });
}
