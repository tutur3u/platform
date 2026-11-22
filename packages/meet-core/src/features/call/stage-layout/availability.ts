import {
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
  if (activityId === PROGRAMMING_ACTIVITY || activityId === DOCUMENT_ACTIVITY)
    return availability.collaboration;
  const toolId = toolIdOf(activityId);
  if (toolId) return availability.live && availability.toolIds.includes(toolId);
  return (
    availability.live &&
    availability.classroom &&
    (CLASSROOM_ACTIVITIES as readonly string[]).includes(activityId)
  );
}
