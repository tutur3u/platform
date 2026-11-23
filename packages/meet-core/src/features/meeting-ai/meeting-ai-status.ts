import type {
  MeetAiSession,
  MeetAiState,
  MeetTranscriptConsent,
} from '@tuturuuu/internal-api';
import type { MeetingAiBlock } from './meeting-ai-unavailable';

/** A stuck notes attempt can be retried after this long. */
export const MEETING_AI_NOTES_RETRY_MS = 120_000;

/**
 * Every state of the transcript and notes panel. Exactly one applies; the
 * panel renders each one and nothing else.
 */
export type MeetingAiStatus =
  | { kind: 'loading' }
  | { kind: 'blocked'; block: MeetingAiBlock }
  /** Nothing running yet; the host can start. */
  | { kind: 'idle' }
  | { kind: 'starting' }
  /** Capturing and sending audio from this device. */
  | { kind: 'live'; session: MeetAiSession }
  /** Running, but someone present has not allowed it; audio stays local. */
  | {
      kind: 'paused';
      session: MeetAiSession;
      pending: number;
      declined: number;
    }
  /** A session is open but this device is not capturing it. */
  | { kind: 'detached'; session: MeetAiSession }
  | { kind: 'processing'; session: MeetAiSession | null }
  | { kind: 'ready'; session: MeetAiSession }
  /** Capture stopped on a billing refusal, or notes could not be generated. */
  | {
      kind: 'failed';
      session: MeetAiSession | null;
      /** True when the host can retry notes for this session now. */
      retryable: boolean;
    };

type Input = {
  isLoading: boolean;
  error: unknown;
  data: MeetAiState | undefined;
  phase: 'starting' | 'finishing' | null;
  capturing: boolean;
  creditFailure: string | null;
  consent?: MeetTranscriptConsent;
  now?: number;
};

const latest = (sessions: MeetAiSession[]): MeetAiSession | undefined =>
  [...sessions].sort(
    (a: MeetAiSession, b: MeetAiSession) =>
      Date.parse(b.created_at) - Date.parse(a.created_at)
  )[0];

export function notesRetryable(session: MeetAiSession, now = Date.now()) {
  if (!session.ended_at || session.notes_status === 'completed') return false;
  if (session.notes_status === 'processing')
    return (
      !session.notes_started_at ||
      now - Date.parse(session.notes_started_at) >= MEETING_AI_NOTES_RETRY_MS
    );
  return true;
}

export function meetingAiStatus(input: Input): MeetingAiStatus {
  const { data, now = Date.now() } = input;
  if (!data) {
    if (input.error) return { kind: 'blocked', block: { kind: 'load_failed' } };
    return { kind: 'loading' };
  }
  if (data.available === false)
    return {
      kind: 'blocked',
      block: { kind: 'off', reason: data.unavailableReason ?? 'disabled' },
    };
  if (!data.configured)
    return { kind: 'blocked', block: { kind: 'not_configured' } };
  if (input.phase === 'finishing')
    return { kind: 'processing', session: latest(data.sessions) ?? null };
  const active = data.sessions.find(
    (session: MeetAiSession) => !session.ended_at
  );
  if (input.phase === 'starting' && !active) return { kind: 'starting' };
  if (active) {
    if (input.creditFailure)
      return { kind: 'failed', session: active, retryable: false };
    const consent = input.consent;
    if (consent?.available && !consent.fence.ready)
      return {
        kind: 'paused',
        session: active,
        pending: consent.fence.pending,
        declined: consent.fence.declined,
      };
    if (input.capturing) return { kind: 'live', session: active };
    if (input.phase === 'starting') return { kind: 'starting' };
    return { kind: 'detached', session: active };
  }
  const last = latest(data.sessions);
  if (!last) return { kind: 'idle' };
  if (last.notes_status === 'completed')
    return { kind: 'ready', session: last };
  if (last.notes_status === 'processing' && !notesRetryable(last, now))
    return { kind: 'processing', session: last };
  if (
    last.notes_status === 'pending' &&
    last.ended_at &&
    now - Date.parse(last.ended_at) < MEETING_AI_NOTES_RETRY_MS
  )
    return { kind: 'processing', session: last };
  return {
    kind: 'failed',
    session: last,
    retryable: notesRetryable(last, now),
  };
}
