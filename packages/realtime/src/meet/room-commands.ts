import type { MeetRealtimeSfuClientMessage } from './messages';
import {
  canMeetRealtimeManageParticipants,
  clampMeetMedia,
  canMeetRealtimeUpdateStage,
  hasMeetRealtimeScope,
  MEET_REALTIME_SCOPES,
} from './permissions';
import {
  createMeetPresence,
  type MeetRoomCommand,
  type MeetRoomOutcome,
  type MeetRoomSnapshot,
  meetAdmissionPendingMessage,
  meetPresenceMessage,
  releaseParticipant,
} from './room';
import {
  accountRoomTime,
  expireRoomBudget,
  roomCapacityError,
} from './room-budget';
import { applyChatMessage } from './room-chat';
import { applyRoomControl, approvedParticipantsMessage } from './room-controls';
import { lobbyDisplayName } from './room-display-name';
import { retireIdlePublication } from './room-idle';
import { denied, outcome } from './room-outcome';
import { applyRecording } from './room-recording';
import { applySfuCommand } from './room-sfu';
import { applyUsageReport, createRoomUsage } from './room-usage';
import { blockAutoAdmission, decideRoomAdmission } from './room-admission';

export function applyMeetRoomCommand(
  state: MeetRoomSnapshot,
  {
    message,
    now,
    token,
    notesEligible,
    canCloseSubscriptions,
    requireAdmission,
  }: MeetRoomCommand
): MeetRoomOutcome {
  const { roomId, userId } = token;
  state = accountRoomTime(state, Date.parse(now));
  const expired = expireRoomBudget(state, Date.parse(now));
  if (expired) return expired;
  if (state.ended)
    return outcome(state, {
      reply: [{ type: 'room.ended' }],
      disconnect: [userId],
    });

  if (requireAdmission && !state.presence[userId] && !state.waiting[userId])
    return denied(state, 'awaiting_admission');
  // A participant still in the lobby may do nothing but wait.
  if (state.waiting[userId] && message.type !== 'presence.join') {
    return denied(state, 'awaiting_admission');
  }

  const control = applyRoomControl(state, message, token, now, notesEligible);
  if (control) return control;
  switch (message.type) {
    case 'assistant.preferences': {
      if (
        message.audio.microphoneEnabled &&
        (!state.liveAssistant ||
          message.audio.sessionId !== state.liveAssistant.sessionId)
      )
        return denied(state, 'assistant_session_changed');
      const existing = state.presence[userId];
      if (!existing) return denied(state, 'awaiting_admission');
      const next = {
        ...state,
        presence: {
          ...state.presence,
          [userId]: {
            ...existing,
            assistantAudio: message.audio,
            lastSeenAt: now,
          },
        },
      };
      return outcome(next, { broadcast: [meetPresenceMessage(next, roomId)] });
    }
    case 'presence.join': {
      const capacityError = roomCapacityError(state, token);
      if (capacityError) return denied(state, capacityError);
      if (state.waiting[userId]) {
        if (!message.displayName) return outcome(state);
        const displayName = lobbyDisplayName(message.displayName);
        // An unchanged name never re-notifies managers (limits prompt spam).
        if (displayName === state.waiting[userId].displayName)
          return outcome(state);
        const next: MeetRoomSnapshot = {
          ...state,
          waiting: {
            ...state.waiting,
            [userId]: {
              ...state.waiting[userId],
              displayName,
            },
          },
        };
        return outcome(next, {
          toManagers: [meetAdmissionPendingMessage(next)],
        });
      }

      const prior = state.presence[userId];
      const person = createMeetPresence(
        {
          ...token,
          displayName:
            token.admission === 'lobby'
              ? (prior?.displayName ??
                state.approved?.[token.accountId ?? userId]?.displayName ??
                token.displayName)
              : message.displayName || token.displayName,
        },
        now,
        message.media
      );
      const next = {
        ...state,
        presence: {
          ...state.presence,
          [userId]: {
            ...person,
            media: clampMeetMedia(state.settings, person, person.media),
            joinedAt: prior?.joinedAt ?? now,
            assistantAudio: prior?.assistantAudio,
          },
        },
      };
      return outcome(next, {
        broadcast: [meetPresenceMessage(next, roomId)],
      });
    }

    case 'presence.update': {
      const capacityError = roomCapacityError(state, token);
      if (capacityError) return denied(state, capacityError);
      const existing = state.presence[userId] ?? createMeetPresence(token, now);
      const next = {
        ...state,
        presence: {
          ...state.presence,
          [userId]: {
            ...existing,
            lastSeenAt: now,
            media: clampMeetMedia(state.settings, existing, message.media),
          },
        },
      };
      return outcome(next, {
        broadcast: [meetPresenceMessage(next, roomId)],
      });
    }

    case 'usage.report':
      if (!state.presence[userId]) return denied(state, 'awaiting_admission');
      return outcome({
        ...state,
        usage: applyUsageReport(
          state.usage ?? createRoomUsage(now),
          userId,
          message.reportId,
          message.bytesReceived,
          now
        ),
      });

    case 'chat.message':
      return applyChatMessage(state, message, token, now);

    case 'stage.update': {
      if (!canMeetRealtimeUpdateStage(token)) {
        return denied(state, 'stage_update_not_allowed', message.requestId);
      }
      const next = { ...state, stage: message.stage };
      return outcome(next, {
        broadcast: [
          { requestId: message.requestId, stage: next.stage, type: 'stage' },
        ],
      });
    }

    case 'hand.raise': {
      const raised = new Set(state.stage.raisedHandUserIds);
      if (message.raised) {
        raised.add(userId);
      } else {
        raised.delete(userId);
      }
      const next = {
        ...state,
        stage: { ...state.stage, raisedHandUserIds: [...raised] },
      };
      return outcome(next, {
        broadcast: [
          { requestId: message.requestId, stage: next.stage, type: 'stage' },
        ],
      });
    }

    case 'admission.decide':
    case 'admission.decideAll':
      return decideRoomAdmission(state, message, token, now);
    case 'presence.resync':
      return state.presence[userId]
        ? outcome(state, { reply: [meetPresenceMessage(state, roomId)] })
        : denied(state, 'awaiting_admission');

    case 'participant.mute': {
      if (!canMeetRealtimeManageParticipants(token)) {
        return denied(state, 'permission_denied', message.requestId);
      }

      const target = state.presence[message.userId];
      if (!target) {
        return denied(state, 'participant_not_found', message.requestId);
      }

      const media = { ...target.media };
      for (const kind of message.kinds) {
        if (kind === 'audio') media.audioEnabled = false;
        if (kind === 'video') media.videoEnabled = false;
        if (kind === 'screen') media.screenEnabled = false;
      }

      const next = {
        ...state,
        presence: {
          ...state.presence,
          [message.userId]: { ...target, lastSeenAt: now, media },
        },
      };

      return outcome(next, {
        broadcast: [
          meetPresenceMessage(next, roomId),
          {
            by: userId,
            kinds: message.kinds,
            requestId: message.requestId,
            type: 'participant.muted',
            userId: message.userId,
          },
        ],
      });
    }

    case 'participant.remove': {
      if (!canMeetRealtimeManageParticipants(token)) {
        return denied(state, 'permission_denied', message.requestId);
      }
      if (message.userId === userId) {
        return denied(state, 'cannot_remove_self', message.requestId);
      }

      const approved = { ...state.approved };
      delete approved[message.userId];
      const accountId =
        state.presence[message.userId]?.accountId ??
        state.waiting[message.userId]?.accountId;
      if (accountId) delete approved[accountId];
      const released = releaseParticipant(
        blockAutoAdmission({ ...state, approved }, accountId ?? message.userId),
        message.userId,
        roomId
      );
      return {
        ...released,
        toManagers: [
          ...released.toManagers,
          approvedParticipantsMessage(released.state),
        ],
        broadcast: [
          ...released.broadcast,
          {
            by: userId,
            requestId: message.requestId,
            type: 'participant.removed',
            userId: message.userId,
          },
        ],
        disconnect: [message.userId],
      };
    }

    case 'media.idle':
      return retireIdlePublication(state, token.userId, message.sessionId);

    case 'recording.state':
      return applyRecording(state, message, token, now);

    case 'stream.state': {
      if (!hasMeetRealtimeScope(token, MEET_REALTIME_SCOPES.streamControl)) {
        return denied(state, 'permission_denied', message.requestId);
      }
      const next = { ...state, streamState: message.state };
      return outcome(next, {
        broadcast: [
          {
            requestId: message.requestId,
            state: message.state,
            type: 'stream.state',
          },
        ],
      });
    }

    default:
      return message.type.startsWith('sfu.')
        ? applySfuCommand(
            state,
            message as MeetRealtimeSfuClientMessage,
            token,
            canCloseSubscriptions
          )
        : outcome(state);
  }
}
