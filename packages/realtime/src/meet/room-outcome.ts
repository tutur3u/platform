import type { MeetRoomOutcome, MeetRoomSnapshot } from './room';
export function outcome(
  state: MeetRoomSnapshot,
  partial: Partial<Omit<MeetRoomOutcome, 'state'>> = {}
): MeetRoomOutcome {
  return {
    broadcast: [],
    direct: [],
    disconnect: [],
    reply: [],
    sfu: null,
    toManagers: [],
    ...partial,
    state,
  };
}
export function denied(
  state: MeetRoomSnapshot,
  error: string,
  requestId?: string
) {
  return outcome(state, { reply: [{ error, requestId, type: 'error' }] });
}

/**
 * Room-shared activity and pen-board state with their rate buckets. A room
 * that ends drops all of it, whether someone ended it or its time ran out, so
 * no answer, key or drawing outlives the room.
 */
export const ENDED_ROOM_TOOLS = {
  liveActivities: undefined,
  liveActivityLimits: undefined,
  penboard: undefined,
  penboardLimits: undefined,
  upskiiPresentation: undefined,
  upskiiPresentationLimits: undefined,
} satisfies Partial<MeetRoomSnapshot>;
