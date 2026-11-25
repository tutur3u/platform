'use client';

import type {
  MeetRoomView,
  MeetStageLayoutSnapshot,
} from '@tuturuuu/realtime/meet';
import { useLayoutEffect, useRef } from 'react';
import {
  canOpenRoomView,
  currentRoomView,
} from '../components/room-navigation-policy';
import { useRoomNavigation } from '../hooks/use-room-navigation';
import {
  BOARD_ACTIVITY,
  DOCUMENT_ACTIVITY,
  PROGRAMMING_ACTIVITY,
  toolActivityId,
  toolIdOf,
  viewOfActivity,
} from './activity-ids';
import { openActivities } from './layout-model';
import type { StageLayoutController } from './use-stage-layout';

/**
 * Follow and Summon over the stage. A leader shares the activity in their
 * focused pane and their whole arrangement. Following mirrors that
 * arrangement (open activities, panes, sizes, focus and a maximized pane)
 * and locks the person's own rearranging until they leave follow mode. A
 * Summon opens one activity or focuses the pane that already has it, and
 * never closes the activities they have open.
 */
export function useStageNavigation({
  room,
  stage,
  drawer,
  onDrawer,
  onBroughtIn,
  onSummoned,
  access,
}: {
  room: Parameters<typeof useRoomNavigation>[0]['room'];
  stage: Pick<
    StageLayoutController,
    | 'focused'
    | 'open'
    | 'close'
    | 'isOpen'
    | 'bring'
    | 'mirror'
    | 'setLocked'
    | 'snapshot'
  >;
  drawer: string | null;
  onDrawer: (drawer: string | null) => void;
  /** A host or co-host opened a shared surface for this person. */
  onBroughtIn: () => void;
  /** A host or co-host opened this tool for the person; it is theirs this session. */
  onSummoned?: (activityId: string) => void;
  access: Parameters<typeof useRoomNavigation>[0]['access'];
}) {
  const latest = useRef(stage);
  latest.current = stage;
  const surface = {
    programming: stage.focused === PROGRAMMING_ACTIVITY,
    document: stage.focused === DOCUMENT_ACTIVITY,
    tool: stage.focused?.startsWith(toolActivityId('')) ? stage.focused : null,
    drawer,
  };
  const mirror = (layout: MeetStageLayoutSnapshot, forced: boolean) => {
    const ids = openActivities({
      root: layout.root,
      focusedPaneId: layout.focusedPaneId,
      maximizedPaneId: layout.maximizedPaneId,
      nextId: 1,
    });
    const keep = (id: string) => {
      // The saved whiteboard needs an account like Co-Programming does.
      const view =
        id === BOARD_ACTIVITY
          ? ({ surface: 'document' } as const)
          : viewOfActivity(id);
      return !view || canOpenRoomView(view, access, forced);
    };
    if (forced) {
      if (
        ids.some(
          (id) =>
            id === PROGRAMMING_ACTIVITY ||
            id === DOCUMENT_ACTIVITY ||
            id === BOARD_ACTIVITY
        )
      )
        onBroughtIn();
      for (const id of ids) if (toolIdOf(id) && keep(id)) onSummoned?.(id);
    }
    const focused = stage.mirror(layout, keep);
    return viewOfActivity(focused) ?? ({ surface: 'stage' } as const);
  };
  const navigation = useRoomNavigation({
    room,
    surface,
    layout: stage.snapshot,
    apply: (next, { forced, layout }) => {
      if (layout) {
        onDrawer(next.drawer);
        return { reached: mirror(layout, forced) };
      }
      if (forced && (next.programming || next.document)) onBroughtIn();
      const target = next.programming
        ? PROGRAMMING_ACTIVITY
        : next.document
          ? DOCUMENT_ACTIVITY
          : next.tool;
      onDrawer(next.drawer);
      if (target) {
        if (forced && next.tool) onSummoned?.(next.tool);
        // Going back returns to the activity the person was in, and closes
        // the one they were brought to if it was not open before.
        const before = stage.focused;
        const drawerBefore = drawer;
        const brought = !stage.isOpen(target);
        // Being brought somewhere is not the person's own edit, so it lands
        // even while follow mode still locks the stage.
        stage.bring(target);
        return {
          back: () => {
            const now = latest.current;
            // Only undo the move while the person is still on what they were
            // brought to; after they moved on, just close what was added.
            const stillThere = now.focused === target;
            if (brought) now.close(target);
            if (!stillThere) return;
            onDrawer(drawerBefore);
            if (before && before !== target && now.isOpen(before))
              now.open(before);
          },
        };
      }
      // The stage view opens nothing: the person stays on what they have open.
      return { reached: currentRoomView(surface) };
    },
    access,
  });
  const following = !!navigation.following;
  const setLocked = stage.setLocked;
  useLayoutEffect(() => setLocked(following), [following, setLocked]);
  return navigation;
}
