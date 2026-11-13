import type { MeetRealtimeTokenPayload } from '../../../packages/realtime/src/meet/primitives';
import { MIRA_ROOM_DENIED } from '../../../packages/realtime/src/meet/room-mira-private';
import {
  type RoomServiceState,
  roomService as applyRoomService,
} from '../../../packages/realtime/src/meet/room-service';
export type { RoomServiceState };
export function roomService(
  state: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  input: unknown
) {
  if (
    input &&
    typeof input === 'object' &&
    'action' in input &&
    [
      'ai.reserve',
      'ai.review.claim',
      'live.reserve',
      'live.audio',
      'live.transcript',
      'live.share',
      'live.share.audio',
    ].includes(String(input.action))
  )
    return { state, body: { error: MIRA_ROOM_DENIED }, status: 403 };
  return applyRoomService(state, token, input);
}
