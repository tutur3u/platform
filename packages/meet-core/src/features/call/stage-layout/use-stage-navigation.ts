'use client';

import type { MeetStageLayoutSnapshot } from '@tuturuuu/realtime/meet';
import { useLayoutEffect, useRef } from 'react';
import {
  canOpenRoomView,
  currentRoomView,
  type RoomViewAccess,
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
 * Whether a leader's activity may open for this person while mirroring. The
 * Tuturuuu Whiteboard needs an account like Co-Programming does, unless the
 * server lets guests open it (`whiteboardPolicy`).
 */
export function canMirrorActivity(
  id: string,
  access: RoomViewAccess,
  forced: boolean,
  guestBoard = false
) {
  const board = id === BOARD_ACTIVITY;
  const view = board
    ? ({ surface: 'document' } as const)
    : viewOfActivity(id);
  const allowed = board && guestBoard ? { ...access, account: true } : access;
  return !view || canOpenRoomView(view, allowed, forced);
}

export type ActivityNavigation = {
  id: string;
  leader: string;
} & (
  | { kind: 'forced-summon' }
  | { kind: 'invited-summon' }
  | { kind: 'follow'; activityId: string }
);

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
  onNavigate,
  access,
  guestBoard = false,
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
  onNavigate?: (navigation: ActivityNavigation) => void;
  access: Parameters<typeof useRoomNavigation>[0]['access'];
  /** A guest may follow a leader onto the Tuturuuu Whiteboard. */
  guestBoard?: boolean;
}) {
  const latest = useRef(stage);
  latest.current = stage;
  const focusedActivity = useRef(stage.focused);
  focusedActivity.current = stage.focused;
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
    const keep = (id: string) =>
      canMirrorActivity(id, access, forced, guestBoard);
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
    return stage.mirror(layout, keep);
  };
  const navigation = useRoomNavigation({
    room,
    surface,
    layout: stage.snapshot,
    apply: (next, { forced, layout, source }) => {
      const before = focusedActivity.current;
      const notify = (activityId: string) => {
        if (!source || (source.kind === 'follow' && activityId === before))
          return;
        const { id, leader, kind } = source;
        onNavigate?.(
          kind === 'follow'
            ? { id, leader, kind, activityId }
            : { id, leader, kind: forced ? 'forced-summon' : 'invited-summon' }
        );
      };
      if (layout) {
        onDrawer(next.drawer);
        const focused = mirror(layout, forced);
        // Several updates can be applied before the mirrored layout renders.
        focusedActivity.current = focused;
        const reached =
          viewOfActivity(focused) ?? ({ surface: 'stage' } as const);
        if (focused && reached.surface !== 'stage') notify(focused);
        return { reached };
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
        const drawerBefore = drawer;
        const brought = !stage.isOpen(target);
        // Being brought somewhere is not the person's own edit, so it lands
        // even while follow mode still locks the stage.
        stage.bring(target);
        focusedActivity.current = target;
        notify(target);
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
