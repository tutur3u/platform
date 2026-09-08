import type {
  MeetRealtimeClientMessage,
  MeetRealtimeServerMessage,
} from './messages';
import type { MeetRealtimeTokenPayload } from './primitives';
import type { MeetRoomSnapshot } from './room';
import { denied, outcome } from './room-outcome';
import { failActiveRecording } from './room-recording';

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
export function applyRoomControl(
  state: MeetRoomSnapshot,
  message: MeetRealtimeClientMessage,
  token: MeetRealtimeTokenPayload,
  now: string
) {
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
      'room.title.update',
      'room.end',
      'admission.forget',
    ].includes(message.type)
  )
    return null;
  if (token.role !== 'host')
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
  if (message.type === 'room.settings.update') {
    const next = {
      ...state,
      settings: { shareNotes: false, ...state.settings, ...message.settings },
    };
    return outcome(next, { broadcast: [roomSettingsMessage(next)] });
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
    return outcome(
      {
        ...failActiveRecording(state, now),
        ended: true,
        presence: {},
        waiting: {},
        tracks: {},
        lastReactionAt: {},
      },
      {
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
      }
    );
  }
  return null;
}
