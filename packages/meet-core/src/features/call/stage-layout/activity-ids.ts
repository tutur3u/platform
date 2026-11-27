import type { MeetRoomView } from '@tuturuuu/realtime/meet';

/** What the call shell and its hooks need of the stage to open activities. */
export interface ActivityStage {
  isOpen: (activityId: string) => boolean;
  toggle: (activityId: string) => void;
  close: (activityId: string) => void;
}

export const PROGRAMMING_ACTIVITY = 'programming';
export const DOCUMENT_ACTIVITY = 'document';
/** The saved Tuturuuu Whiteboard, apart from the classroom whiteboard. */
export const BOARD_ACTIVITY = 'board';

const TOOL_PREFIX = 'tool:';

/** Stage id of a registered tool; it matches the room's `tool:<id>` view. */
export const toolActivityId = (toolId: string) => `${TOOL_PREFIX}${toolId}`;

export const toolIdOf = (activityId: string | null) =>
  activityId?.startsWith(TOOL_PREFIX)
    ? activityId.slice(TOOL_PREFIX.length)
    : null;

/** Classroom activities that render as panes beside the registered tools. */
export const CLASSROOM_ACTIVITIES = ['whiteboard', 'breakouts'] as const;

/** The room view an activity stands for; classroom panes have none. */
export function viewOfActivity(activityId: string | null): MeetRoomView | null {
  if (activityId === PROGRAMMING_ACTIVITY) return { surface: 'programming' };
  if (activityId === DOCUMENT_ACTIVITY) return { surface: 'document' };
  if (activityId === BOARD_ACTIVITY) return { surface: 'board' };
  const toolId = toolIdOf(activityId);
  return toolId ? { surface: 'tool', toolId } : null;
}

/** Inverse of `viewOfActivity`; `stage` has no single activity id. */
export function activityOfView(view: MeetRoomView): string | null {
  if (view.surface === 'programming') return PROGRAMMING_ACTIVITY;
  if (view.surface === 'document') return DOCUMENT_ACTIVITY;
  if (view.surface === 'board') return BOARD_ACTIVITY;
  if (view.surface === 'tool') return toolActivityId(view.toolId);
  return null;
}
