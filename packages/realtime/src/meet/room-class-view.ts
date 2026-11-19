import { meetClassFeatures, type MeetClassFeatures } from './class-features';
import { canViewClassAttendance } from './class-timer';
import type { MeetRealtimeTokenPayload } from './primitives';
import type { MeetRoomSnapshot } from './room';
import { canReadRoomNotes } from './room-controls';

export function meetRoomStateView(
  snapshot: MeetRoomSnapshot,
  token: MeetRealtimeTokenPayload,
  features: MeetClassFeatures = meetClassFeatures()
) {
  return {
    canReadNotes: canReadRoomNotes(snapshot, token),
    ended: !!snapshot.ended,
    lifecycleVersion: snapshot.lifecycle?.version ?? 0,
    ...(token.role === 'host'
      ? { settings: snapshot.settings ?? { shareNotes: false } }
      : {}),
    ...(features.attendance && canViewClassAttendance(token)
      ? { attendance: snapshot.attendance ?? [] }
      : {}),
  };
}
