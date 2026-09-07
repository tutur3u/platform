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
