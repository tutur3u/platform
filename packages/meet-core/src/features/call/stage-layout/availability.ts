import {
  BOARD_ACTIVITY,
  CLASSROOM_ACTIVITIES,
  DOCUMENT_ACTIVITY,
  PROGRAMMING_ACTIVITY,
  toolIdOf,
} from './activity-ids';

/** What decides whether a stage activity may be on screen right now. */
export interface ActivityAvailability {
  /** The call is live and its activities exist for this person. */
  live: boolean;
  /** May use Co-Programming and the live document. */
  collaboration: boolean;
  classroom: boolean;
  /** Ids of the registered tools. */
  toolIds: readonly string[];
}

export function isActivityAvailable(
  activityId: string,
  availability: ActivityAvailability
) {
  if (
    activityId === PROGRAMMING_ACTIVITY ||
    activityId === DOCUMENT_ACTIVITY ||
    activityId === BOARD_ACTIVITY
  )
    return availability.collaboration;
  const toolId = toolIdOf(activityId);
  if (toolId) return availability.live && availability.toolIds.includes(toolId);
  return (
    availability.live &&
    availability.classroom &&
    (CLASSROOM_ACTIVITIES as readonly string[]).includes(activityId)
  );
}

/** Tools anyone in a live call may open: the polls and quiz shortcuts. */
const SHORTCUT_TOOLS = ['polls', 'quiz'] as const;

/**
 * The tool ids that may be on the stage: the ones this person may browse,
 * the live shortcuts, and tools a host or co-host opened for them this
 * session. A tool a person could only reach through an earlier role is not
 * among them, so a saved layout cannot bring it back.
 */
export function allowedToolIds(
  browsable: readonly string[],
  summoned: readonly string[]
) {
  return [
    ...new Set([
      ...browsable,
      ...SHORTCUT_TOOLS,
      ...summoned.flatMap((id) => toolIdOf(id) ?? []),
    ]),
  ];
}
