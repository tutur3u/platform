import {
  type MeetClassFeatures,
  meetClassFeatures,
} from '../../../packages/realtime/src/meet/class-features';
import {
  applyExternalClassRoom,
  MEET_EXTERNAL_CLASS_SCOPE,
} from '../../../packages/realtime/src/meet/external-class-room';
import type { MeetRoomFormsEnv } from '../../../packages/realtime/src/meet/room-forms';
import type { MeetRealtimeTokenPayload } from '../../../packages/realtime/src/meet/primitives';
import { applyRoomBoardAccess } from '../../../packages/realtime/src/meet/room-board-access';
import { applyRoomClassroomTools } from '../../../packages/realtime/src/meet/room-classroom-tools';
import {
  applyMiraRoomConsent,
  fenceMiraRoomRequest,
  guardMeetTranscriptAllow,
} from '../../../packages/realtime/src/meet/room-mira-consent';
import { MIRA_ROOM_DENIED } from '../../../packages/realtime/src/meet/room-mira-private';
import { routeSelfCapture } from '../../../packages/realtime/src/meet/room-self-capture-route';
import { applyMeetTranscriptConsent } from '../../../packages/realtime/src/meet/room-transcript-consent';
import {
  type RoomServiceResult,
  type RoomServiceState,
  roomService as applyRoomService,
} from '../../../packages/realtime/src/meet/room-service';
export type { RoomServiceState };

/** The room's environment, plus the room ids that have an open socket. */
export type RoomServiceEnv = MeetRoomFormsEnv & {
  connectedUsers?: ReadonlySet<string>;
};

export function roomService(
  state: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  input: unknown,
  features: MeetClassFeatures = meetClassFeatures(),
  formsEnv: RoomServiceEnv = {}
): RoomServiceResult {
  const externalClass = applyExternalClassRoom(
    state,
    token,
    input,
    formsEnv.connectedUsers ?? new Set(),
    features
  );
  if (externalClass) return externalClass;
  if (token.scopes.includes(MEET_EXTERNAL_CLASS_SCOPE)) {
    return { state, status: 403, body: { error: 'Forbidden' } };
  }
  // The board check needs the live sockets, which only the room knows.
  const board = applyRoomBoardAccess(
    state,
    token,
    input,
    formsEnv.connectedUsers ?? new Set()
  );
  if (board) return board;
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
  // Per-speaker commands first; every other command settles the
  // per-speaker fence afterwards. The room env carries the flag bindings.
  return routeSelfCapture(state, token, input, formsEnv, (current) =>
    roomCommands(current, token, input, features, formsEnv)
  );
}

export function roomServiceResponse(result: RoomServiceResult) {
  return Response.json(result.body, {
    status: result.status ?? 200,
    headers: {
      'Cache-Control': 'private, no-store',
      ...(result.retryAfterSeconds === undefined
        ? {}
        : { 'Retry-After': String(result.retryAfterSeconds) }),
    },
  });
}

function roomCommands(
  state: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  input: unknown,
  features: MeetClassFeatures,
  formsEnv: MeetRoomFormsEnv
): RoomServiceResult {
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
