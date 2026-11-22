/** What the call shell and its hooks need of the stage to open activities. */
export interface ActivityStage {
  isOpen: (activityId: string) => boolean;
  toggle: (activityId: string) => void;
  close: (activityId: string) => void;
}

export const PROGRAMMING_ACTIVITY = 'programming';
export const DOCUMENT_ACTIVITY = 'document';

const TOOL_PREFIX = 'tool:';

/** Stage id of a registered tool; it matches the room's `tool:<id>` view. */
export const toolActivityId = (toolId: string) => `${TOOL_PREFIX}${toolId}`;

export const toolIdOf = (activityId: string | null) =>
  activityId?.startsWith(TOOL_PREFIX)
    ? activityId.slice(TOOL_PREFIX.length)
    : null;

/** Classroom activities that render as panes beside the registered tools. */
export const CLASSROOM_ACTIVITIES = ['whiteboard', 'breakouts'] as const;
