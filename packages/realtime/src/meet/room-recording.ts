import type {
  MeetRealtimeClientMessage,
  MeetRealtimeServerMessage,
} from './messages';
import type { MeetRealtimeTokenPayload } from './primitives';
import type { MeetRoomSnapshot } from './room';
import { denied, outcome } from './room-outcome';

export type RoomRecording = {
  sessionId: string;
  ownerAccountId: string;
  ownerDeviceId: string;
  startedAt: string;
  endedAt?: string;
  path?: string;
  storageWsId?: string;
  status: 'recording' | 'ready' | 'failed';
};
export function recordingMessage(
  state: MeetRoomSnapshot,
  requestId?: string
): MeetRealtimeServerMessage {
  return {
    type: 'recording.state',
    state: state.recording.state,
    recordingSessionId: state.recording.sessionId ?? undefined,
    ownerDeviceId: state.recording.ownerDeviceId,
    requestId,
  };
}
export function applyRecording(
  state: MeetRoomSnapshot,
  message: Extract<MeetRealtimeClientMessage, { type: 'recording.state' }>,
  token: MeetRealtimeTokenPayload,
  now: string
) {
  const manages = token.role === 'host';
  const owns = state.recording.ownerDeviceId === token.userId;
  const controls = manages || !!state.settings?.allowParticipantRecording;
  if (!state.presence[token.userId])
    return denied(state, 'awaiting_admission', message.requestId);
  if (!controls && !(owns && ['idle', 'error'].includes(message.state)))
    return denied(state, 'permission_denied', message.requestId);
  let next = state;
  if (message.state === 'starting') {
    if (!['idle', 'error'].includes(state.recording.state))
      return denied(state, 'recording_already_active', message.requestId);
    if (!message.recordingSessionId)
      return denied(state, 'recording_session_required', message.requestId);
    if (
      (state.recordings ?? []).some(
        (r) => r.sessionId === message.recordingSessionId
      )
    )
      return denied(state, 'recording_session_exists', message.requestId);
    next = {
      ...state,
      recording: {
        sessionId: message.recordingSessionId,
        state: 'starting',
        ownerDeviceId: token.userId,
      },
      recordings: [
        ...(state.recordings ?? []),
        {
          sessionId: message.recordingSessionId,
          ownerAccountId: token.accountId ?? token.userId,
          ownerDeviceId: token.userId,
          startedAt: now,
          status: 'recording',
        },
      ],
    };
  } else if (message.state === 'stopping') {
    if (!state.recording.sessionId)
      return denied(state, 'recording_not_active', message.requestId);
    next = { ...state, recording: { ...state.recording, state: 'stopping' } };
  } else {
    if (message.state === 'recording' && state.recording.state !== 'starting')
      return denied(state, 'recording_invalid_transition', message.requestId);
    if (!owns || message.recordingSessionId !== state.recording.sessionId)
      return denied(state, 'recording_not_owned', message.requestId);
    next = {
      ...state,
      recording:
        message.state === 'idle' || message.state === 'error'
          ? { sessionId: null, state: message.state }
          : { ...state.recording, state: message.state },
    };
  }
  return outcome(next, {
    reply: [recordingMessage(next, message.requestId)],
    broadcast: [recordingMessage(next)],
  });
}
