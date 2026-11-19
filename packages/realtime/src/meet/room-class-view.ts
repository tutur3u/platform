import type { MeetRealtimeTokenPayload } from './primitives';
import type { MeetRoomSnapshot } from './room';
import { canReadRoomNotes } from './room-controls';

/** Browser room state never includes the attendance ledger. */
export function meetRoomStateView(
  snapshot: MeetRoomSnapshot,
  token: MeetRealtimeTokenPayload
) {
  return {
    canReadNotes: canReadRoomNotes(snapshot, token),
    ended: !!snapshot.ended,
    lifecycleVersion: snapshot.lifecycle?.version ?? 0,
    ...(token.role === 'host'
      ? { settings: snapshot.settings ?? { shareNotes: false } }
      : {}),
  };
}
