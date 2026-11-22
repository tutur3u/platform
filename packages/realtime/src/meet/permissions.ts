import { MEET_CLASS_COHOST_SCOPE } from './class-timer';
import type { MeetRoomSettings } from './room-options';
import type {
  MeetMediaState,
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

export function usesMeetClassMediaRoles(token: MeetRealtimeTokenPayload) {
  return token.mode === 'call' && token.meetingApp !== 'parley';
}

export function meetNonClassMedia(token: MeetRealtimeTokenPayload) {
  if (!usesMeetClassMediaRoles(token)) return true;
  if (token.meetingApp === 'meet' || token.limits.maxPublishers >= 50)
    return false;
  return undefined;
}

export function canEnableMeetClassViewers(token: MeetRealtimeTokenPayload) {
  return usesMeetClassMediaRoles(token) && token.limits.maxPublishers >= 50;
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

/**
 * Who runs the room's live activities and moderates the pen board: the host,
 * anyone who manages participants, and a workspace admin in someone else's
 * meeting. That admin joins as a speaker with the co-host scope and holds no
 * participant-management scope, so both are checked.
 */
export function canMeetRealtimeRunActivities(
  token: Pick<MeetRealtimeTokenPayload, 'role' | 'scopes'>
) {
  return (
    canMeetRealtimeManageParticipants(token) ||
    token.scopes.includes(MEET_CLASS_COHOST_SCOPE)
  );
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

export const MEET_MEDIA_CONTROLS = {
  audio: { lock: 'micsLocked', override: 'mic' },
  video: { lock: 'camerasLocked', override: 'camera' },
  screen: { lock: 'screensLocked', override: 'screen' },
  screen_audio: { lock: 'screensLocked', override: 'screen' },
} as const;

type MediaParticipant = Pick<
  MeetRealtimeTokenPayload,
  'userId' | 'accountId' | 'role'
> & {
  canManageParticipants?: boolean;
};

export function isMeetMediaLocked(
  settings: MeetRoomSettings | undefined,
  participant: MediaParticipant,
  kind: MeetRealtimeTrackKind
) {
  if (participant.role === 'viewer') return true;
  const { lock, override } = MEET_MEDIA_CONTROLS[kind];
  return (
    !!settings?.[lock] &&
    participant.role !== 'host' &&
    !participant.canManageParticipants &&
    !(
      settings.mediaOverrides?.[participant.userId]?.[override] ??
      (participant.accountId
        ? settings.mediaOverrides?.[participant.accountId]?.[override]
        : undefined)
    )
  );
}

export function clampMeetMedia(
  settings: MeetRoomSettings | undefined,
  participant: MediaParticipant,
  media: MeetMediaState
): MeetMediaState {
  return {
    audioEnabled:
      media.audioEnabled && !isMeetMediaLocked(settings, participant, 'audio'),
    videoEnabled:
      media.videoEnabled && !isMeetMediaLocked(settings, participant, 'video'),
    screenEnabled:
      media.screenEnabled &&
      !isMeetMediaLocked(settings, participant, 'screen'),
  };
}

export function meetTrackKind(track: {
  kind?: string;
  trackName?: string;
}): MeetRealtimeTrackKind {
  const kinds = ['screen_audio', 'screen', 'audio', 'video'] as const;
  return (
    kinds.find((kind) => kind === track.kind) ??
    (['screen_audio', 'screen', 'audio', 'video'] as const).find((kind) =>
      track.trackName?.endsWith(`-${kind}`)
    ) ??
    'video'
  );
}

/** Activity frames for whoever runs activities: the view and its updates. */
const MANAGER_ACTIVITY_FRAMES = new Set(['activity.host', 'activity.progress']);

/**
 * Whether a message for the room's managers reaches this token. Participant
 * managers get all of them. The activity view also goes to workspace co-hosts,
 * who run activities without managing participants; nothing else reaches them.
 * Every transport delivers manager messages through this one rule.
 */
export function receivesMeetManagerMessage(
  token: Pick<MeetRealtimeTokenPayload, 'role' | 'scopes'>,
  message: { type: string }
) {
  return (
    canMeetRealtimeManageParticipants(token) ||
    (MANAGER_ACTIVITY_FRAMES.has(message.type) &&
      canMeetRealtimeRunActivities(token))
  );
}

const PRIVATE_TOOL_FRAMES = new Set([
  'activity.mine',
  'activity.known',
  'activity.host',
  'activity.progress',
  'penboard.snapshot',
  'penboard.stroke',
  'qa.host',
]);

/** Frames that carry one person's or the managers' activity data. */
export const isMeetPrivateToolFrame = (message: { type: string }) =>
  PRIVATE_TOOL_FRAMES.has(message.type);

/**
 * Whether a frame may reach this token right now. Private activity views and
 * the board go only to people who are admitted at the moment of delivery, in a
 * room that has not ended, and the manager view only to those who run
 * activities. Every other frame is unaffected. Every transport delivers
 * through this one rule.
 */
export function receivesMeetToolFrame(
  state: {
    ended?: boolean;
    presence: Readonly<Record<string, unknown>>;
    waiting: Readonly<Record<string, unknown>>;
  },
  token: Pick<MeetRealtimeTokenPayload, 'role' | 'scopes' | 'userId'>,
  message: { type: string }
) {
  if (!PRIVATE_TOOL_FRAMES.has(message.type)) return true;
  return (
    !state.ended &&
    !!state.presence[token.userId] &&
    !state.waiting[token.userId] &&
    (!MANAGER_ACTIVITY_FRAMES.has(message.type) ||
      canMeetRealtimeRunActivities(token)) &&
    // The full Q&A view names anonymous askers and holds hidden questions.
    (message.type !== 'qa.host' || token.role === 'host')
  );
}
