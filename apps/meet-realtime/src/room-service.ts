import {
  type MeetClassFeatures,
  meetClassFeatures,
} from '../../../packages/realtime/src/meet/class-features';
import type { MeetRoomFormsEnv } from '../../../packages/realtime/src/meet/room-forms';
import type { MeetRealtimeTokenPayload } from '../../../packages/realtime/src/meet/primitives';
import { applyRoomClassroomTools } from '../../../packages/realtime/src/meet/room-classroom-tools';
import { MIRA_ROOM_DENIED } from '../../../packages/realtime/src/meet/room-mira-private';
import {
  type RoomServiceResult,
  type RoomServiceState,
  roomService as applyRoomService,
} from '../../../packages/realtime/src/meet/room-service';
export type { RoomServiceState };
export function roomService(
  state: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  input: unknown,
  features: MeetClassFeatures = meetClassFeatures(),
  formsEnv: MeetRoomFormsEnv = {}
): RoomServiceResult {
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
  return (
    applyRoomClassroomTools(state, token, input) ??
    applyRoomService(state, token, input, features, formsEnv)
  );
}
