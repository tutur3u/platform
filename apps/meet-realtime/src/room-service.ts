import {
  type MeetClassFeatures,
  meetClassFeatures,
} from '../../../packages/realtime/src/meet/class-features';
import type { MeetRoomFormsEnv } from '../../../packages/realtime/src/meet/room-forms';
import type { MeetRealtimeTokenPayload } from '../../../packages/realtime/src/meet/primitives';
import { applyRoomClassroomTools } from '../../../packages/realtime/src/meet/room-classroom-tools';
import {
  applyMiraRoomConsent,
  fenceMiraRoomRequest,
  guardMeetTranscriptAllow,
} from '../../../packages/realtime/src/meet/room-mira-consent';
import { MIRA_ROOM_DENIED } from '../../../packages/realtime/src/meet/room-mira-private';
import { applyMeetTranscriptConsent } from '../../../packages/realtime/src/meet/room-transcript-consent';
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
      // Room chat (@mira) is fenced below; room Live voice stays denied.
      'live.reserve',
      'live.audio',
      'live.transcript',
      'live.share',
      'live.share.audio',
    ].includes(String(input.action))
  )
    return { state, body: { error: MIRA_ROOM_DENIED }, status: 403 };
  const classroom = applyRoomClassroomTools(state, token, input);
  if (classroom) return classroom;
  const consent = applyMiraRoomConsent(state, token, input);
  if (consent) return consent;
  // A transcript Allow needs the participant's own room Mira choice on.
  const refused = guardMeetTranscriptAllow(state, token, input);
  if (refused) return refused;
  const transcript = applyMeetTranscriptConsent(state, token, input);
  if (transcript) return transcript;
  return fenceMiraRoomRequest(state, token, input, () =>
    applyRoomService(state, token, input, features, formsEnv)
  );
}
