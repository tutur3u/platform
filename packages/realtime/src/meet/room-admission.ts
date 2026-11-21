import { MEET_MEDIA_CAPABILITIES } from './simulcast-layers';
import {
  attendanceIdentity,
  attendancePatch,
  openAttendanceInterval,
  renameOpenAttendance,
} from './attendance-ledger';
import { type MeetClassFeatures, meetClassFeatures } from './class-features';
import {
  classTimerServerMessage,
  meetClassRole,
  presentClassTimer,
} from './class-timer';
import type {
  MeetRealtimeClientMessage,
  MeetRealtimeServerMessage,
} from './messages';
import {
  canEnableMeetClassViewers,
  canMeetRealtimeManageParticipants,
  clampMeetMedia,
  meetNonClassMedia,
} from './permissions';
import type {
  MeetRealtimePresence,
  MeetRealtimeTokenPayload,
} from './primitives';
import {
  createMeetPresence,
  getMeetDisplayName,
  type MeetRoomOutcome,
  type MeetRoomSnapshot,
  meetAdmissionPendingMessage,
  meetPresenceMessage,
  remoteMeetTracks,
} from './room';
import {
  accountRoomTime,
  expireRoomBudget,
  roomCapacityError,
  startRoomBudget,
} from './room-budget';
import {
  approvedParticipantsMessage,
  rememberAdmission,
  roomSettingsMessage,
} from './room-controls';
import { lobbyDisplayName } from './room-display-name';
import {
  hasMeetMediaContextConflict,
  resolveMeetRoomMediaRole,
} from './room-media-role';
import { denied, outcome } from './room-outcome';
import { isGuestRemovalBlocked } from './room-removed-guests';
import { recordingMessage } from './room-recording';
import { transcriptionAnnouncements } from './transcription';

export function admitOrHold(
  state: MeetRoomSnapshot,
  token: MeetRealtimeTokenPayload,
  now: string,
  features: MeetClassFeatures = meetClassFeatures()
): MeetRoomOutcome {
  state = accountRoomTime(state, Date.parse(now));
  if (state.budget) state = startRoomBudget(state, token, Date.parse(now));
  const expired = expireRoomBudget(state, Date.parse(now), features);
  if (expired) return expired;
  if (hasMeetMediaContextConflict(state, token))
    return denied(state, 'room_mode_conflict');
  token = resolveMeetRoomMediaRole(state, token);
  if (state.ended)
    return outcome(state, {
      reply: [{ type: 'room.ended' }],
      disconnect: [token.userId],
    });
  if (token.guest) {
    const removed = isGuestRemovalBlocked(
      state,
      token.accountId ?? token.userId,
      Date.parse(now)
    );
    if (removed.blocked)
      return outcome(state, {
        reply: [{ type: 'error', error: 'guest_removed' }],
        disconnect: [token.userId],
      });
  }
  if (
    token.role !== 'host' &&
    state.settings?.admissionClosed &&
    (state.budget?.maxParticipants !== undefined ||
      token.limits.maxParticipants !== undefined) &&
    !state.presence[token.userId]
  )
    return outcome(state, {
      reply: [{ type: 'error', error: 'admission_closed' }],
      disconnect: [token.userId],
    });
  if (
    (token.guest || token.admission === 'lobby') &&
    !state.presence[token.userId] &&
    !state.approved?.[token.accountId ?? token.userId] &&
    !(
      !token.guest &&
      state.settings?.skipLobby &&
      !state.settings.admissionClosed &&
      !state.deniedAutoAdmission?.includes(token.accountId ?? token.userId) &&
      (state.deniedAutoAdmission?.length ?? 0) < 256
    )
  ) {
    if (
      Object.keys(state.waiting).length >= 104 &&
      !state.waiting[token.userId]
    )
      return outcome(state, {
        reply: [{ type: 'error', error: 'participant_limit_reached' }],
        disconnect: [token.userId],
      });
    const next: MeetRoomSnapshot = {
      ...state,
      waiting: {
        ...state.waiting,
        [token.userId]: {
          ...(canMeetRealtimeManageParticipants(token)
            ? { canManageParticipants: true }
            : {}),
          ...(token.guest ? { guest: true as const } : {}),
          ...(token.participantKind
            ? { participantKind: token.participantKind }
            : {}),
          accountId: token.accountId,
          avatarUrl: token.avatarUrl,
          displayName: lobbyDisplayName(getMeetDisplayName(token)),
          role: token.role === 'viewer' ? 'viewer' : 'speaker',
          nonClassMedia: meetNonClassMedia(token),
          requestedAt: now,
          userId: token.userId,
        },
      },
    };

    return outcome(next, {
      reply: [buildReady(next, token, 'waiting', now, features)],
      toManagers: [meetAdmissionPendingMessage(next)],
    });
  }

  const capacityError = roomCapacityError(state, token);
  if (capacityError)
    return outcome(state, {
      reply: [{ type: 'error', error: capacityError }],
      disconnect: [token.userId],
    });
  state = startRoomBudget(state, token, Date.parse(now));
  const previous = state.presence[token.userId];
  const person = createMeetPresence(token, now, previous?.media);
  if (previous) person.joinedAt = previous.joinedAt;
  person.media = clampMeetMedia(state.settings, person, person.media);
  if (token.admission === 'lobby') {
    person.displayName =
      previous?.displayName ??
      state.approved?.[token.accountId ?? token.userId]?.displayName ??
      person.displayName;
  }
  const waiting = { ...state.waiting };
  delete waiting[token.userId];
  const attendance = features.attendance
    ? previous
      ? renameOpenAttendance(state.attendance, token.userId, person.displayName)
      : openAttendanceInterval(state.attendance, {
          deviceUserId: token.userId,
          joinedAt: person.joinedAt,
          ...attendanceIdentity({ ...token, displayName: person.displayName }),
        })
    : undefined;
  const next: MeetRoomSnapshot = {
    ...state,
    ...(attendance ? attendancePatch(state, attendance) : {}),
    waiting,
    approved: rememberAdmission(state, person),
    presence: {
      ...state.presence,
      [token.userId]: person,
    },
  };

  return outcome(next, {
    broadcast: [meetPresenceMessage(next, token.roomId)],
    toManagers: [
      approvedParticipantsMessage(next),
      ...(state.waiting[token.userId]
        ? [meetAdmissionPendingMessage(next)]
        : []),
    ],
    reply: [
      {
        ...buildReady(next, token, 'admitted', now, features),
        resumed: !!previous,
      },
      roomSettingsMessage(next),
      recordingMessage(next),
      ...transcriptionAnnouncements(next, token.userId),
      ...(next.chat ?? []).map((entry) => ({ ...entry, replayed: true })),
      ...(token.role === 'host' ? [approvedParticipantsMessage(next)] : []),
      ...(canMeetRealtimeManageParticipants(token)
        ? [meetAdmissionPendingMessage(next)]
        : []),
    ],
  });
}

function buildReady(
  state: MeetRoomSnapshot,
  token: MeetRealtimeTokenPayload,
  admission: 'admitted' | 'waiting',
  now: string,
  features: MeetClassFeatures
): Extract<MeetRealtimeServerMessage, { type: 'ready' }> {
  const timer = features.timer
    ? presentClassTimer(state.classTimer, now)
    : null;
  return {
    admission,
    canManageParticipants: canMeetRealtimeManageParticipants(token),
    classRole: meetClassRole(token),
    ...(canEnableMeetClassViewers(token)
      ? { classViewersAvailable: true }
      : {}),
    classAttendanceEnabled: features.attendance,
    classTimerEnabled: features.timer,
    ...(admission === 'admitted' && features.timer
      ? { classTimer: timer, serverNow: now }
      : {}),
    tracks: admission === 'admitted' ? Object.values(state.tracks) : [],
    expiresAt: new Date(token.exp * 1000).toISOString(),
    roomExpiresAt: state.budget
      ? new Date(state.budget.expiresAt).toISOString()
      : undefined,
    limits: {
      ...token.limits,
      maxParticipants:
        state.budget?.maxParticipants ?? token.limits.maxParticipants,
      maxPublishers: state.budget?.maxPublishers ?? token.limits.maxPublishers,
      maxViewers: state.budget?.maxViewers ?? token.limits.maxViewers,
    },
    mediaCapabilities: [...MEET_MEDIA_CAPABILITIES],
    mode: token.mode,
    role: token.role,
    roomId: token.roomId,
    stage: state.stage,
    type: 'ready',
    userId: token.userId,
  };
}

function decideParticipant(
  state: MeetRoomSnapshot,
  targetId: string,
  admit: boolean,
  token: MeetRealtimeTokenPayload,
  now: string,
  requestId?: string,
  features: MeetClassFeatures = meetClassFeatures()
): MeetRoomOutcome {
  const { userId, roomId } = token;
  const pending = state.waiting[targetId];
  if (!pending) {
    return denied(state, 'participant_not_waiting', requestId);
  }

  const waiting = { ...state.waiting };
  delete waiting[targetId];

  if (!admit) {
    const next = {
      ...blockAutoAdmission(state, pending.accountId ?? targetId),
      waiting,
    };
    return outcome(next, {
      direct: [
        {
          message: {
            admitted: false,
            decidedBy: userId,
            type: 'admission.result',
          },
          userId: targetId,
        },
      ],
      disconnect: [targetId],
      toManagers: [meetAdmissionPendingMessage(next)],
    });
  }

  if (state.budget) state = startRoomBudget(state, token, Date.parse(now));
  const role = pending.role;
  if (!role) return denied(state, 'awaiting_admission', requestId);
  const capacityError = roomCapacityError(state, token, targetId, role);
  if (capacityError) return denied(state, capacityError);
  state = startRoomBudget(state, token, Date.parse(now));
  const admittedKind =
    pending.participantKind ?? (pending.guest ? 'guest' : 'member');
  const admittedId = pending.accountId ?? targetId;
  const person: MeetRealtimePresence = {
    ...(pending.canManageParticipants ? { canManageParticipants: true } : {}),
    ...(pending.guest ? { guest: true as const } : {}),
    accountId: pending.accountId,
    avatarUrl: pending.avatarUrl,
    displayName: pending.displayName,
    joinedAt: now,
    lastSeenAt: now,
    media: { audioEnabled: false, screenEnabled: false, videoEnabled: false },
    nonClassMedia: pending.nonClassMedia,
    role,
    userId: targetId,
  };
  const attendance = features.attendance
    ? openAttendanceInterval(state.attendance, {
        deviceUserId: targetId,
        kind: admittedKind,
        displayName: pending.displayName,
        joinedAt: now,
        ...(admittedKind === 'member'
          ? { userId: admittedId }
          : { guestId: admittedId }),
      })
    : undefined;
  const next: MeetRoomSnapshot = {
    ...state,
    ...(attendance ? attendancePatch(state, attendance) : {}),
    presence: {
      ...state.presence,
      [targetId]: person,
    },
    waiting,
    usage: state.usage
      ? {
          ...state.usage,
          devices:
            Object.keys(state.usage.devices).length < 4096
              ? { ...state.usage.devices, [targetId]: true }
              : state.usage.devices,
          limitedReports:
            (state.usage.limitedReports ?? 0) +
            (Object.keys(state.usage.devices).length >= 4096 &&
            !state.usage.devices[targetId]
              ? 1
              : 0),
        }
      : undefined,
    approved: rememberAdmission(state, person),
  };

  return outcome(next, {
    broadcast: [meetPresenceMessage(next, roomId)],
    direct: [
      {
        message: {
          admitted: true,
          roomExpiresAt: next.budget
            ? new Date(next.budget.expiresAt).toISOString()
            : undefined,
          decidedBy: userId,
          ...(role === 'viewer' ? { role } : {}),
          type: 'admission.result',
        },
        userId: targetId,
      },
      { userId: targetId, message: roomSettingsMessage(next) },
      ...(features.timer
        ? [
            {
              userId: targetId,
              message: classTimerServerMessage(
                presentClassTimer(next.classTimer, now),
                now
              ),
            },
          ]
        : []),
      { userId: targetId, message: recordingMessage(next) },
      ...transcriptionAnnouncements(next, targetId).map((message) => ({
        userId: pending.userId,
        message,
      })),
      ...(next.chat ?? []).map((entry) => ({
        userId: targetId,
        message: { ...entry, replayed: true },
      })),
      ...remoteMeetTracks(next, targetId).map((track) => ({
        userId: targetId,
        message: {
          type: 'track.published' as const,
          sessionId: track.sessionId,
          tracks: [track],
          userId: track.userId,
        },
      })),
    ],
    toManagers: [
      meetAdmissionPendingMessage(next),
      approvedParticipantsMessage(next),
    ],
  });
}

export function decideRoomAdmission(
  state: MeetRoomSnapshot,
  message: Extract<
    MeetRealtimeClientMessage,
    { type: 'admission.decide' | 'admission.decideAll' }
  >,
  token: MeetRealtimeTokenPayload,
  now: string,
  features: MeetClassFeatures = meetClassFeatures()
): MeetRoomOutcome {
  if (
    !canMeetRealtimeManageParticipants(token) ||
    (message.type === 'admission.decideAll' && !state.presence[token.userId])
  )
    return denied(state, 'permission_denied', message.requestId);
  if (message.type === 'admission.decide')
    return decideParticipant(
      state,
      message.userId,
      message.admit,
      token,
      now,
      message.requestId,
      features
    );

  const result = outcome(state);
  let decided = 0;
  const waiting = Object.values(state.waiting).sort((a, b) =>
    a.requestedAt.localeCompare(b.requestedAt)
  );
  for (const person of waiting) {
    const next = decideParticipant(
      result.state,
      person.userId,
      message.admit,
      token,
      now,
      undefined,
      features
    );
    if (next.reply.length) continue;
    result.state = next.state;
    result.direct.push(...next.direct);
    result.disconnect.push(...next.disconnect);
    decided++;
  }
  result.reply.push({
    type: 'admission.bulkResult',
    requestId: message.requestId,
    admitted: message.admit ? decided : 0,
    denied: message.admit ? 0 : decided,
    remaining: waiting.length - decided,
  });
  if (decided) {
    if (message.admit)
      result.broadcast.push(meetPresenceMessage(result.state, token.roomId));
    result.toManagers.push(meetAdmissionPendingMessage(result.state));
    if (message.admit)
      result.toManagers.push(approvedParticipantsMessage(result.state));
  }
  return result;
}

export function blockAutoAdmission(state: MeetRoomSnapshot, id: string) {
  const blocked = state.deniedAutoAdmission ?? [];
  return blocked.length >= 256 || blocked.includes(id)
    ? state
    : {
        ...state,
        deniedAutoAdmission: [...blocked, id],
      };
}
