import type { MeetRealtimeSfuClientMessage } from './messages';
import {
  canMeetRealtimeManageParticipants,
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
  remoteMeetTracks,
} from './room';
import {
  accountRoomTime,
  expireRoomBudget,
  roomCapacityError,
  startRoomBudget,
} from './room-budget';
import { applyChatMessage } from './room-chat';
import {
  applyRoomControl,
  approvedParticipantsMessage,
  roomSettingsMessage,
} from './room-controls';
import { retireIdlePublication } from './room-idle';
import { denied, outcome } from './room-outcome';
import { applyRecording, recordingMessage } from './room-recording';
import { applySfuCommand } from './room-sfu';
import { applyUsageReport, createRoomUsage } from './room-usage';
import { transcriptionAnnouncements } from './transcription';

export function applyMeetRoomCommand(
  state: MeetRoomSnapshot,
  { message, now, token, notesEligible }: MeetRoomCommand
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
      if (state.waiting[userId]) return outcome(state);

      const next = {
        ...state,
        presence: {
          ...state.presence,
          [userId]: {
            ...createMeetPresence(
              {
                ...token,
                displayName: message.displayName || token.displayName,
              },
              now,
              message.media
            ),
            joinedAt: state.presence[userId]?.joinedAt ?? now,
            assistantAudio: state.presence[userId]?.assistantAudio,
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
          [userId]: { ...existing, lastSeenAt: now, media: message.media },
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

    case 'admission.decide': {
      if (!canMeetRealtimeManageParticipants(token)) {
        return denied(state, 'permission_denied', message.requestId);
      }

      const pending = state.waiting[message.userId];
      if (!pending) {
        return denied(state, 'participant_not_waiting', message.requestId);
      }

      const waiting = { ...state.waiting };
      delete waiting[message.userId];

      if (!message.admit) {
        const next = { ...state, waiting };
        return outcome(next, {
          direct: [
            {
              message: {
                admitted: false,
                decidedBy: userId,
                type: 'admission.result',
              },
              userId: message.userId,
            },
          ],
          disconnect: [message.userId],
          toManagers: [meetAdmissionPendingMessage(next)],
        });
      }

      const capacityError = roomCapacityError(
        state,
        token,
        message.userId,
        'speaker'
      );
      if (capacityError) return denied(state, capacityError);
      state = startRoomBudget(state, token, Date.parse(now));
      const next: MeetRoomSnapshot = {
        ...state,
        presence: {
          ...state.presence,
          [message.userId]: {
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
            userId: message.userId,
          },
        },
        waiting,
        usage: state.usage
          ? {
              ...state.usage,
              devices:
                Object.keys(state.usage.devices).length < 4096
                  ? { ...state.usage.devices, [message.userId]: true }
                  : state.usage.devices,
              limitedReports:
                (state.usage.limitedReports ?? 0) +
                (Object.keys(state.usage.devices).length >= 4096 &&
                !state.usage.devices[message.userId]
                  ? 1
                  : 0),
            }
          : undefined,
        approved: {
          ...state.approved,
          [pending.accountId ?? message.userId]: {
            userId: pending.accountId ?? message.userId,
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
            userId: message.userId,
          },
          { userId: message.userId, message: roomSettingsMessage(next) },
          { userId: message.userId, message: recordingMessage(next) },
          ...transcriptionAnnouncements(next, message.userId).map(
            (message) => ({ userId: pending.userId, message })
          ),
          ...(next.chat ?? []).map((entry) => ({
            userId: message.userId,
            message: { ...entry, replayed: true },
          })),
          ...remoteMeetTracks(next, message.userId).map((track) => ({
            userId: message.userId,
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
        { ...state, approved },
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
        ? applySfuCommand(state, message as MeetRealtimeSfuClientMessage, token)
        : outcome(state);
  }
}
