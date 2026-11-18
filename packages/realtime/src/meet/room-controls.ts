import type {
  MeetRealtimeClientMessage,
  MeetRealtimeServerMessage,
} from './messages';
import {
  canMeetRealtimeManageParticipants,
  clampMeetMedia,
  isMeetMediaLocked,
  meetTrackKind,
} from './permissions';
import type {
  MeetRealtimePresence,
  MeetRealtimeTrackKind,
  MeetRealtimeTokenPayload,
} from './primitives';
import {
  meetPresenceMessage,
  meetTrackKey,
  type MeetRoomSnapshot,
} from './room';
import { startRoomBudget } from './room-budget';
import type { MeetRoomSettings } from './room-options';
import { publicationCleanupKey } from './room-tracks';
import { endMeetRoom } from './room-ending';
import { denied, outcome } from './room-outcome';
import { applyTranscription } from './transcription';

export function approvedParticipantsMessage(
  state: MeetRoomSnapshot
): MeetRealtimeServerMessage {
  return {
    type: 'admission.approved',
    participants: Object.values(state.approved ?? {}),
  };
}
export function roomSettingsMessage(
  state: MeetRoomSnapshot
): MeetRealtimeServerMessage {
  return {
    type: 'room.settings',
    settings: state.settings ?? { shareNotes: false },
  };
}
export function canReadRoomNotes(
  state: MeetRoomSnapshot,
  token: MeetRealtimeTokenPayload
) {
  return (
    token.role === 'host' ||
    Boolean(
      (state.ended
        ? state.settings?.shareNotesAfterMeeting
        : state.settings?.shareNotes) &&
      (state.presence[token.userId] ||
        Object.values(state.presence).some(
          (person) =>
            (person.accountId ?? person.userId) ===
            (token.accountId ?? token.userId)
        ) ||
        state.approved?.[token.accountId ?? token.userId] ||
        state.approved?.[token.userId])
    )
  );
}
/**
 * Turning note sharing on is Meet AI behavior, so it follows the pilot gate at
 * the authoritative write. Turning it off is always allowed.
 */
export function enablesNoteSharing(settings: {
  shareNotes?: boolean;
  shareNotesAfterMeeting?: boolean;
}) {
  return (
    settings.shareNotes === true || settings.shareNotesAfterMeeting === true
  );
}
export function applyRoomControl(
  state: MeetRoomSnapshot,
  message: MeetRealtimeClientMessage,
  token: MeetRealtimeTokenPayload,
  now: string,
  notesEligible = false
) {
  const transcription = applyTranscription(state, message, token);
  if (transcription) return transcription;
  if (message.type === 'reaction.send') {
    if (!state.presence[token.userId])
      return denied(state, 'awaiting_admission');
    const time = Date.parse(now);
    if (time - (state.lastReactionAt?.[token.userId] ?? 0) < 1000)
      return outcome(state);
    return outcome(
      {
        ...state,
        lastReactionAt: { ...state.lastReactionAt, [token.userId]: time },
      },
      {
        broadcast: [
          {
            type: 'reaction',
            reaction: message.reaction,
            userId: token.userId,
            createdAt: now,
          },
        ],
      }
    );
  }
  if (
    ![
      'room.settings.update',
      'room.mediaOverride',
      'room.title.update',
      'room.end',
      'admission.forget',
    ].includes(message.type)
  )
    return null;
  const managesMedia =
    message.type === 'room.mediaOverride' ||
    (message.type === 'room.settings.update' &&
      Object.keys(message.settings).every((key) =>
        [
          'micsLocked',
          'camerasLocked',
          'screensLocked',
          'mediaOverrides',
        ].includes(key)
      ));
  if (
    (managesMedia &&
      (!state.presence[token.userId] ||
        !canMeetRealtimeManageParticipants(token))) ||
    (!managesMedia && token.role !== 'host')
  )
    return denied(
      state,
      'permission_denied',
      'requestId' in message ? message.requestId : undefined
    );
  if (message.type === 'room.title.update')
    return outcome(state, {
      reply: [
        {
          type: 'room.title.changed',
          title: message.title,
          requestId: message.requestId,
        },
      ],
      broadcast: [{ type: 'room.title.changed', title: message.title }],
    });
  if (message.type === 'room.mediaOverride') {
    if (!state.presence[message.userId])
      return denied(state, 'participant_not_found', message.requestId);
    const mediaOverrides = { ...state.settings?.mediaOverrides };
    if (message.override === null) delete mediaOverrides[message.userId];
    else
      mediaOverrides[message.userId] = {
        ...mediaOverrides[message.userId],
        ...message.override,
      };
    if (Object.keys(mediaOverrides).length > 256)
      return denied(state, 'media_override_limit_reached', message.requestId);
    return applyMeetRoomSettings(
      state,
      { shareNotes: false, ...state.settings, mediaOverrides },
      token,
      now
    );
  }
  if (message.type === 'room.settings.update') {
    const maximum = Math.min(
      state.budget?.maxParticipants ?? 100,
      token.limits.maxParticipants ?? state.budget?.maxParticipants ?? 0
    );
    if (
      (message.settings.maxParticipants !== undefined ||
        message.settings.admissionClosed !== undefined) &&
      (!maximum ||
        (message.settings.maxParticipants !== undefined &&
          message.settings.maxParticipants > maximum))
    )
      return denied(state, 'permission_denied');
    if (!notesEligible && enablesNoteSharing(message.settings))
      return denied(
        state,
        'permission_denied',
        'requestId' in message ? message.requestId : undefined
      );
    return applyMeetRoomSettings(
      state,
      {
        shareNotes: false,
        ...state.settings,
        ...message.settings,
      },
      token,
      now
    );
  }
  if (message.type === 'admission.forget') {
    const approved = { ...state.approved };
    delete approved[message.userId];
    const accountId =
      state.presence[message.userId]?.accountId ??
      state.waiting[message.userId]?.accountId;
    if (accountId) delete approved[accountId];
    const next = { ...state, approved };
    return outcome(next, { toManagers: [approvedParticipantsMessage(next)] });
  }
  if (message.type === 'room.end') {
    return outcome(endMeetRoom(state, now), {
      reply: [
        {
          type: 'room.ended',
          by: token.userId,
          requestId: message.requestId,
        },
      ],
      broadcast: [{ type: 'room.ended', by: token.userId }],
      disconnect: [
        ...new Set([
          ...Object.keys(state.presence),
          ...Object.keys(state.waiting),
        ]),
      ],
    });
  }
  return null;
}

/** Remember admission when it occurs, so ending a room cannot undo a later revocation. */
export function rememberAdmission(
  state: MeetRoomSnapshot,
  person: MeetRealtimePresence
) {
  if (person.role === 'host') return state.approved;
  const accountId = person.accountId ?? person.userId;
  return {
    ...state.approved,
    [accountId]: {
      userId: accountId,
      displayName: person.displayName,
      avatarUrl: person.avatarUrl,
    },
  };
}

export function applyMeetRoomSettings(
  state: MeetRoomSnapshot,
  settings: MeetRoomSettings,
  token: MeetRealtimeTokenPayload,
  now: string
) {
  const next = { ...state, settings };
  const messages: MeetRealtimeServerMessage[] = [roomSettingsMessage(next)];
  const kinds = ['audio', 'video', 'screen', 'screen_audio'] as const;
  const revoked = new Map<string, Set<MeetRealtimeTrackKind>>();
  for (const person of Object.values(state.presence)) {
    const locked = kinds.filter(
      (kind) =>
        isMeetMediaLocked(settings, person, kind) &&
        !isMeetMediaLocked(state.settings, person, kind)
    );
    if (!locked.length) continue;
    revoked.set(person.userId, new Set(locked));
    const media = clampMeetMedia(settings, person, person.media);
    if (next.presence === state.presence) next.presence = { ...state.presence };
    next.presence[person.userId] = { ...person, media };
    messages.push({
      type: 'participant.muted',
      by: token.userId,
      userId: person.userId,
      kinds: locked,
    });
  }

  const retired = Object.values(state.tracks).filter((track) =>
    revoked.get(track.userId)?.has(meetTrackKind(track))
  );
  if (retired.length) {
    const groups = new Map<string, typeof retired>();
    next.tracks = { ...state.tracks };
    for (const track of retired) {
      delete next.tracks[meetTrackKey(track)];
      const key = JSON.stringify([track.userId, track.sessionId]);
      const group = groups.get(key) ?? [];
      group.push(track);
      groups.set(key, group);
    }
    for (const tracks of groups.values()) {
      const first = tracks[0]!;
      messages.push({
        type: 'track.closed',
        userId: first.userId,
        sessionId: first.sessionId,
        tracks,
      });
    }
    const budget = startRoomBudget(next, token, Date.parse(now)).budget;
    if (budget)
      next.budget = {
        ...budget,
        nextCleanupAt: 0,
        pendingPublications: [
          ...new Map(
            [...(budget.pendingPublications ?? []), ...retired].map((track) => [
              publicationCleanupKey(track),
              track,
            ])
          ).values(),
        ],
      };
  }
  if (next.presence !== state.presence)
    messages.push(meetPresenceMessage(next, token.roomId));
  return outcome(next, { broadcast: messages });
}
