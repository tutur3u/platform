import type {
  MeetRealtimeTokenPayload,
  MeetRealtimeTrackKind,
} from './primitives';

export const MEET_REALTIME_SCOPES = {
  chatWrite: 'chat:write',
  participantsManage: 'participants:manage',
  presence: 'presence',
  recordingControl: 'recording:control',
  sfuJoin: 'sfu:join',
  sfuPublish: 'sfu:publish',
  sfuSubscribe: 'sfu:subscribe',
  stageWrite: 'stage:write',
  streamControl: 'stream:control',
} as const;

export type MeetRealtimeScope =
  (typeof MEET_REALTIME_SCOPES)[keyof typeof MEET_REALTIME_SCOPES];

/** Hosts implicitly hold every scope. */
export function hasMeetRealtimeScope(
  token: Pick<MeetRealtimeTokenPayload, 'role' | 'scopes'>,
  scope: string
) {
  return token.role === 'host' || token.scopes.includes(scope);
}

export function canMeetRealtimePublish(
  token: Pick<MeetRealtimeTokenPayload, 'mode' | 'role' | 'scopes'>,
  _kind: MeetRealtimeTrackKind | string
) {
  if (!hasMeetRealtimeScope(token, MEET_REALTIME_SCOPES.sfuPublish)) {
    return false;
  }

  if (token.role === 'viewer') {
    return false;
  }

  return token.mode !== 'stream' || token.role === 'host';
}

export function canMeetRealtimeUpdateStage(
  token: Pick<MeetRealtimeTokenPayload, 'role' | 'scopes'>
) {
  return hasMeetRealtimeScope(token, MEET_REALTIME_SCOPES.stageWrite);
}

/** Admitting from the lobby, force-muting and removing are one capability. */
export function canMeetRealtimeManageParticipants(
  token: Pick<MeetRealtimeTokenPayload, 'role' | 'scopes'>
) {
  return hasMeetRealtimeScope(token, MEET_REALTIME_SCOPES.participantsManage);
}

export function canMeetRealtimeControlRecording(
  token: Pick<MeetRealtimeTokenPayload, 'role' | 'scopes'>
) {
  return hasMeetRealtimeScope(token, MEET_REALTIME_SCOPES.recordingControl);
}

export function getMeetRealtimeScopesForRole(
  role: MeetRealtimeTokenPayload['role']
): string[] {
  const base = [
    MEET_REALTIME_SCOPES.presence,
    MEET_REALTIME_SCOPES.chatWrite,
    MEET_REALTIME_SCOPES.sfuJoin,
    MEET_REALTIME_SCOPES.sfuSubscribe,
  ];

  if (role === 'viewer') return base;
  if (role === 'speaker') return [...base, MEET_REALTIME_SCOPES.sfuPublish];

  return [
    ...base,
    MEET_REALTIME_SCOPES.sfuPublish,
    MEET_REALTIME_SCOPES.stageWrite,
    MEET_REALTIME_SCOPES.streamControl,
    MEET_REALTIME_SCOPES.participantsManage,
    MEET_REALTIME_SCOPES.recordingControl,
  ];
}
