import type { MeetRealtimeServerMessage } from './messages';
import { canMeetRealtimeManageParticipants } from './permissions';
import type { MeetRealtimeTokenPayload } from './primitives';
import {
  createMeetPresence,
  getMeetDisplayName,
  type MeetRoomOutcome,
  type MeetRoomSnapshot,
  meetAdmissionPendingMessage,
  meetPresenceMessage,
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
import { outcome } from './room-outcome';
import { recordingMessage } from './room-recording';

export function admitOrHold(
  state: MeetRoomSnapshot,
  token: MeetRealtimeTokenPayload,
  now: string
): MeetRoomOutcome {
  state = accountRoomTime(state, Date.parse(now));
  const expired = expireRoomBudget(state, Date.parse(now));
  if (expired) return expired;
  if (state.ended)
    return outcome(state, {
      reply: [{ type: 'room.ended' }],
      disconnect: [token.userId],
    });
  if (
    token.admission === 'lobby' &&
    !state.presence[token.userId] &&
    !state.approved?.[token.accountId ?? token.userId]
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
          accountId: token.accountId,
          avatarUrl: token.avatarUrl,
          displayName: getMeetDisplayName(token),
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
  const next: MeetRoomSnapshot = {
    ...state,
    approved: rememberAdmission(state, person),
    presence: {
      ...state.presence,
      [token.userId]: person,
    },
  };

  return outcome(next, {
    broadcast: [meetPresenceMessage(next, token.roomId)],
    toManagers: [approvedParticipantsMessage(next)],
    reply: [
      { ...buildReady(next, token, 'admitted'), resumed: !!previous },
      roomSettingsMessage(next),
      recordingMessage(next),
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
    tracks: admission === 'admitted' ? Object.values(state.tracks) : [],
    expiresAt: new Date(token.exp * 1000).toISOString(),
    roomExpiresAt: state.budget
      ? new Date(state.budget.expiresAt).toISOString()
      : undefined,
    limits: {
      ...token.limits,
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
