import { z } from 'zod';
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
  transcriptionConsents?: Record<string, boolean>;
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
    ...Object.entries(state.transcriptionConsents ?? {})
      .filter(([id]) => person.role === 'host' || id === userId)
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
  token: MeetRealtimeTokenPayload
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
    const next = {
      ...state,
      transcription: message.state,
      transcriptionConsents: changedSession ? {} : state.transcriptionConsents,
    };
    return outcome(next, {
      broadcast: [{ type: 'transcription.state', state: message.state }],
    });
  }
  if (message.userId !== token.userId)
    return denied(state, 'permission_denied', message.requestId);
  const next = {
    ...state,
    transcriptionConsents: {
      ...state.transcriptionConsents,
      [token.userId]: message.allowed,
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
