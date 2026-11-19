import type {
  MeetRealtimeClientMessage,
  MeetRealtimeServerMessage,
} from './messages';
import {
  canMeetRealtimeManageParticipants,
  clampMeetMedia,
} from './permissions';
import type { MeetRealtimeTokenPayload } from './primitives';
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
import { denied, outcome } from './room-outcome';
import { isGuestRemovalBlocked } from './room-removed-guests';
import { recordingMessage } from './room-recording';
import { transcriptionAnnouncements } from './transcription';

export function admitOrHold(
  state: MeetRoomSnapshot,
  token: MeetRealtimeTokenPayload,
  now: string
): MeetRoomOutcome {
  state = accountRoomTime(state, Date.parse(now));
  if (state.budget) state = startRoomBudget(state, token, Date.parse(now));
  const expired = expireRoomBudget(state, Date.parse(now));
  if (expired) return expired;
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
    token.admission === 'lobby' &&
    !state.presence[token.userId] &&
    !state.approved?.[token.accountId ?? token.userId] &&
    !(
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
          accountId: token.accountId,
          avatarUrl: token.avatarUrl,
          displayName: lobbyDisplayName(getMeetDisplayName(token)),
          requestedAt: now,
          userId: token.userId,
        },
      },
    };

    return outcome(next, {
      reply: [buildReady(next, token, 'waiting')],
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
  const next: MeetRoomSnapshot = {
    ...state,
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
      { ...buildReady(next, token, 'admitted'), resumed: !!previous },
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
  admission: 'admitted' | 'waiting'
): Extract<MeetRealtimeServerMessage, { type: 'ready' }> {
  return {
    admission,
    canManageParticipants: canMeetRealtimeManageParticipants(token),
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
  requestId?: string
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
  const capacityError = roomCapacityError(state, token, targetId, 'speaker');
  if (capacityError) return denied(state, capacityError);
  state = startRoomBudget(state, token, Date.parse(now));
  const next: MeetRoomSnapshot = {
    ...state,
    presence: {
      ...state.presence,
      [targetId]: {
        ...(pending.canManageParticipants
          ? { canManageParticipants: true }
          : {}),
        accountId: pending.accountId,
        avatarUrl: pending.avatarUrl,
        displayName: pending.displayName,
        joinedAt: now,
        lastSeenAt: now,
        media: {
          audioEnabled: false,
          screenEnabled: false,
          videoEnabled: false,
        },
        role: 'speaker',
        userId: targetId,
      },
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
    approved: {
      ...state.approved,
      [pending.accountId ?? targetId]: {
        userId: pending.accountId ?? targetId,
        displayName: pending.displayName,
        avatarUrl: pending.avatarUrl,
      },
    },
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
          type: 'admission.result',
        },
        userId: targetId,
      },
      { userId: targetId, message: roomSettingsMessage(next) },
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
  now: string
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
      message.requestId
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
      now
    );
    if (next.reply.length) break;
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
