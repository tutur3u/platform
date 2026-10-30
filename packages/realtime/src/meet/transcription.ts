import { z } from 'zod';
import { queueTranscriptionFinalization } from './finalization';
import type {
  MeetRealtimeClientMessage,
  MeetRealtimeServerMessage,
} from './messages';
import type { MeetRealtimeTokenPayload } from './primitives';
import type { MeetRoomSnapshot } from './room';
import { denied, outcome } from './room-outcome';

const fields = {
  sessionId: z.uuid(),
  startedBy: z.uuid(),
  language: z.enum(['auto', 'vi', 'en', 'vi+en']),
  consentRequired: z.literal(true),
};
export const transcriptionStateSchema = z.discriminatedUnion('active', [
  z.object({ active: z.literal(true), ...fields }),
  z.object({
    active: z.literal(false),
    ...fields,
    sessionId: z.uuid().nullable(),
    startedBy: z.uuid().nullable(),
  }),
]);
export const transcriptionStateMessageSchema = z.object({
  type: z.literal('transcription.state'),
  state: transcriptionStateSchema,
  requestId: z.string().trim().min(1).max(120).optional(),
});
export const transcriptionConsentMessageSchema = z.object({
  type: z.literal('transcription.consent'),
  userId: z.uuid(),
  allowed: z.boolean(),
  requestId: z.string().trim().min(1).max(120).optional(),
});
export type TranscriptionState = z.infer<typeof transcriptionStateSchema>;
export type TranscriptionStateMessage = z.infer<
  typeof transcriptionStateMessageSchema
>;
export type TranscriptionConsentMessage = z.infer<
  typeof transcriptionConsentMessageSchema
>;
export interface TranscriptionRoomState {
  transcription?: TranscriptionState;
  // Ephemeral room state, not the legal consent record in private.meet_ai_consents.
  transcriptionConsents?: {
    sessionId: string;
    decisions: Record<string, boolean>;
    // Device id -> account id, recorded when the decision is made so it
    // survives the participant leaving. Used only to finalize the session.
    accounts?: Record<string, string>;
    meetingId?: string;
    wsId?: string;
  };
}
export function transcriptionAnnouncements(
  state: MeetRoomSnapshot,
  userId: string
): MeetRealtimeServerMessage[] {
  const person = state.presence[userId];
  if (!person || state.waiting[userId]) return [];
  return [
    ...(state.transcription
      ? [{ type: 'transcription.state' as const, state: state.transcription }]
      : []),
    ...Object.entries(currentTranscriptionConsents(state))
      .filter(([id]) => id === userId)
      .map(([id, allowed]) => ({
        type: 'transcription.consent' as const,
        userId: id,
        allowed,
      })),
  ];
}
export function applyTranscription(
  state: MeetRoomSnapshot,
  message: MeetRealtimeClientMessage,
  token: MeetRealtimeTokenPayload,
  now = new Date().toISOString()
) {
  if (
    message.type !== 'transcription.state' &&
    message.type !== 'transcription.consent'
  )
    return null;
  if (!state.presence[token.userId] || state.waiting[token.userId])
    return denied(state, 'awaiting_admission', message.requestId);
  if (message.type === 'transcription.state') {
    if (
      token.role !== 'host' ||
      (message.state.active && message.state.startedBy !== token.userId)
    )
      return denied(state, 'permission_denied', message.requestId);
    const changedSession =
      state.transcription?.sessionId !== message.state.sessionId;
    // A stopped or replaced session is finalized while its consent is readable.
    const finalizing =
      changedSession || !message.state.active
        ? queueTranscriptionFinalization(state, Date.parse(now), {
            ending: false,
          })
        : state;
    const next = {
      ...finalizing,
      transcription: message.state,
      transcriptionConsents: message.state.active
        ? {
            sessionId: message.state.sessionId,
            decisions: changedSession
              ? {}
              : currentTranscriptionConsents(state),
            accounts: changedSession
              ? {}
              : state.transcriptionConsents?.accounts,
            meetingId: token.meetingId,
            wsId: token.wsId,
          }
        : undefined,
    };
    return outcome(next, {
      broadcast: [{ type: 'transcription.state', state: message.state }],
    });
  }
  if (message.userId !== token.userId)
    return denied(state, 'permission_denied', message.requestId);
  if (!state.transcription?.active || state.ended)
    return denied(state, 'transcription_not_active', message.requestId);
  const next = {
    ...state,
    transcriptionConsents: {
      sessionId: state.transcription.sessionId,
      decisions: {
        ...currentTranscriptionConsents(state),
        [token.userId]: message.allowed,
      },
      accounts: {
        ...state.transcriptionConsents?.accounts,
        [token.userId]: token.accountId ?? token.userId,
      },
      meetingId: token.meetingId,
      wsId: token.wsId,
    },
  };
  return outcome(next, {
    reply: [message],
    direct: Object.values(state.presence)
      .filter(
        (person) =>
          person.role === 'host' &&
          !state.waiting[person.userId] &&
          person.userId !== token.userId
      )
      .map((person) => ({ userId: person.userId, message })),
  });
}

export function currentTranscriptionConsents(
  state: MeetRoomSnapshot
): Record<string, boolean> {
  return !state.ended &&
    state.transcription?.active &&
    state.transcriptionConsents?.sessionId === state.transcription.sessionId
    ? state.transcriptionConsents.decisions
    : {};
}
export function transcriptionClientSnapshot(
  state: MeetRoomSnapshot,
  userId: string
) {
  if (!state.presence[userId] || state.waiting[userId]) return {};
  const decisions = currentTranscriptionConsents(state);
  const values = Object.values(decisions);
  return {
    transcription: state.transcription,
    transcriptionConsent: {
      sessionId: state.transcription?.sessionId ?? null,
      allowed: decisions[userId],
      counts: {
        allowed: values.filter(Boolean).length,
        declined: values.filter((v) => !v).length,
      },
    },
  };
}
export function normalizeTranscriptionConsent(
  state: MeetRoomSnapshot
): MeetRoomSnapshot {
  return {
    ...state,
    transcriptionConsents:
      !state.ended &&
      state.transcription?.active &&
      state.transcriptionConsents?.sessionId === state.transcription.sessionId
        ? state.transcriptionConsents
        : undefined,
  };
}
