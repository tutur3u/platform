import {
  canEnableMeetClassViewers,
  clampMeetMedia,
  MEET_REALTIME_SCOPES,
  meetNonClassMedia,
  usesMeetClassMediaRoles,
} from './permissions';
import type { MeetRealtimeTokenPayload } from './primitives';
import { type MeetRoomSnapshot, meetPresenceMessage } from './room';
import { roomCapacityError } from './room-budget';
import { queueRoomPublicationCleanup } from './room-cleanup';
import {
  approvedParticipantsMessage,
  rememberAdmission,
} from './room-controls';
import { denied, outcome } from './room-outcome';

export function recoverMeetMediaRoles<T extends MeetRoomSnapshot>(
  state: T,
  tokens: readonly MeetRealtimeTokenPayload[]
): T {
  let recovered = state;
  const reclassified = new Set<string>();
  const attachments = [...tokens].sort(
    (a, b) => Number(b.role === 'viewer') - Number(a.role === 'viewer')
  );
  for (const token of attachments) {
    const pending = state.waiting[token.userId];
    const nonClassMedia = meetNonClassMedia(token);
    if (
      pending &&
      !pending.role &&
      pending.accountId === token.accountId &&
      recovered.waiting[token.userId]?.role !== 'viewer'
    ) {
      const role = token.role === 'viewer' ? 'viewer' : 'speaker';
      recovered = {
        ...recovered,
        waiting: {
          ...recovered.waiting,
          [token.userId]: { ...pending, role, nonClassMedia },
        },
      };
    }
    const present = recovered.presence[token.userId];
    if (
      present &&
      present.nonClassMedia === undefined &&
      present.accountId === token.accountId &&
      ((nonClassMedia !== undefined && present.role === token.role) ||
        (present.role === 'speaker' && token.role === 'viewer'))
    ) {
      const person = { ...present, nonClassMedia, role: token.role };
      person.media = clampMeetMedia(recovered.settings, person, person.media);
      if (present.role !== person.role) reclassified.add(person.userId);
      recovered = {
        ...recovered,
        approved: rememberAdmission(recovered, person),
        presence: { ...recovered.presence, [token.userId]: person },
      };
    }
  }
  if (reclassified.size) {
    const tracks = { ...recovered.tracks };
    const retired = [];
    for (const [key, track] of Object.entries(tracks)) {
      if (!reclassified.has(track.userId)) continue;
      retired.push(track);
      delete tracks[key];
    }
    recovered = queueRoomPublicationCleanup(
      { ...recovered, tracks, presenceSeq: (recovered.presenceSeq ?? 0) + 1 },
      retired
    );
  }
  return recovered;
}

export function hasMeetMediaContextConflict(
  state: MeetRoomSnapshot,
  token: MeetRealtimeTokenPayload
) {
  const existing = state.presence[token.userId] ?? state.waiting[token.userId];
  const incoming = meetNonClassMedia(token);
  return (
    incoming !== undefined &&
    existing?.nonClassMedia !== undefined &&
    existing.nonClassMedia !== incoming
  );
}

export function resolveMeetRoomMediaRole(
  state: MeetRoomSnapshot,
  token: MeetRealtimeTokenPayload
): MeetRealtimeTokenPayload {
  const { userId } = token;
  const current = state.presence[userId] ?? state.waiting[userId];
  if (token.mode === 'call' && !token.meetingApp) {
    if (current?.nonClassMedia === true)
      return { ...token, meetingApp: 'parley' };
    if (current?.nonClassMedia === false || state.settings?.viewersByDefault)
      token = { ...token, meetingApp: 'meet' };
  }
  if (!usesMeetClassMediaRoles(token) || token.role === 'host') return token;
  const currentRole =
    current?.nonClassMedia === true ? undefined : current?.role;
  const approved = state.approved?.[token.accountId ?? userId]?.classMediaRole;
  const defaultRole = state.settings?.viewersByDefault ? 'viewer' : 'speaker';
  const publish = MEET_REALTIME_SCOPES.sfuPublish;

  if (approved === 'promoted' && currentRole !== 'viewer')
    return {
      ...token,
      role: 'speaker',
      scopes: token.scopes.includes(publish)
        ? token.scopes
        : [...token.scopes, publish],
    };
  if (
    token.role === 'viewer' ||
    (currentRole ?? approved ?? defaultRole) === 'viewer'
  )
    return {
      ...token,
      role: 'viewer',
      scopes: token.scopes.filter((scope) => scope !== publish),
    };
  return token;
}

export function promoteMeetViewer(
  state: MeetRoomSnapshot,
  token: MeetRealtimeTokenPayload,
  userId: string,
  requestId?: string
) {
  if (
    token.role !== 'host' ||
    !state.presence[token.userId] ||
    !canEnableMeetClassViewers(token)
  )
    return denied(state, 'permission_denied', requestId);
  const person = state.presence[userId];
  if (!person) return denied(state, 'participant_not_found', requestId);
  if (person.role !== 'viewer') return outcome(state);
  if (person.nonClassMedia !== false)
    return denied(state, 'permission_denied', requestId);
  const capacityError = roomCapacityError(state, token, userId, 'speaker');
  if (capacityError) return denied(state, capacityError, requestId);
  const promoted = { ...person, role: 'speaker' as const };
  const next: MeetRoomSnapshot = {
    ...state,
    approved: rememberAdmission(state, promoted, 'promoted'),
    presence: {
      ...state.presence,
      [userId]: promoted,
    },
  };
  return outcome(next, {
    broadcast: [meetPresenceMessage(next, token.roomId)],
    toManagers: [approvedParticipantsMessage(next)],
  });
}
