import type { MeetRoomSnapshot } from './room';

/**
 * Transcription finalization ledger. Framework independent: the room Durable
 * Object stores this record in its own snapshot (no database column) and
 * delivers it to Meet with a signed, content-free request.
 *
 * Cost bounds: one record per session id (idempotent), at most
 * MEET_FINALIZE_MAX_ATTEMPTS deliveries with growing backoff, and the attempt
 * is persisted before the request leaves, so a crash or restart can never
 * extend the budget. Meet performs at most one billed generation per session.
 */
export const MEET_FINALIZE_MAX_ATTEMPTS = 6;
export const MEET_FINALIZE_FIRST_DELAY_MS = 20_000;
export const MEET_FINALIZE_BACKOFF_MS = [
  30_000, 60_000, 120_000, 240_000, 480_000,
] as const;
export const MEET_FINALIZE_MAX_RECORDS = 8;
export const MEET_FINALIZE_MAX_ACCOUNTS = 128;

export interface MeetFinalization {
  sessionId: string;
  meetingId: string;
  wsId: string;
  /** Accounts whose speech may be used. Everyone else is excluded by Meet. */
  consentedAccountIds: string[];
  /** Accounts that may read the notes under the room policy at end time. */
  readerAccountIds: string[];
  queuedAt: number;
  attempts: number;
  nextAttemptAt: number;
  status: 'pending' | 'done' | 'abandoned';
}

export interface MeetFinalizationState {
  finalizations?: Record<string, MeetFinalization>;
}

const accountSet = (ids: Iterable<string | undefined>) =>
  [...new Set([...ids].filter((id): id is string => !!id))]
    .sort()
    .slice(0, MEET_FINALIZE_MAX_ACCOUNTS);

/**
 * Queue the finalization of the active transcription session. Call it with the
 * state BEFORE the session stops or the room ends, while consent is readable.
 */
export function queueTranscriptionFinalization(
  state: MeetRoomSnapshot,
  now: number,
  context: { ending: boolean }
): MeetRoomSnapshot {
  const session = state.transcription;
  const consents = state.transcriptionConsents;
  if (
    !session?.active ||
    !consents ||
    consents.sessionId !== session.sessionId ||
    !consents.meetingId ||
    !consents.wsId ||
    state.finalizations?.[session.sessionId]
  )
    return state;
  const accountOf = (userId: string) =>
    consents.accounts?.[userId] ??
    state.presence[userId]?.accountId ??
    userId;
  const consented = accountSet(
    Object.entries(consents.decisions)
      .filter(([, allowed]) => allowed)
      .map(([userId]) => accountOf(userId))
  );
  // Nobody consented: there is nothing to transcribe and nothing to bill.
  if (!consented.length) return state;
  const shared = context.ending
    ? state.settings?.shareNotesAfterMeeting
    : state.settings?.shareNotes;
  const readers = shared
    ? accountSet([
        ...Object.keys(consents.decisions).map(accountOf),
        ...Object.values(state.presence).map(
          (person) => person.accountId ?? person.userId
        ),
      ])
    : [];
  const current = Object.values(state.finalizations ?? {});
  const pending = current.filter((entry) => entry.status === 'pending');
  if (pending.length >= MEET_FINALIZE_MAX_RECORDS) return state;
  const settled = current
    .filter((entry) => entry.status !== 'pending')
    .sort((a, b) => b.queuedAt - a.queuedAt)
    .slice(0, MEET_FINALIZE_MAX_RECORDS - pending.length - 1);
  const record: MeetFinalization = {
    sessionId: session.sessionId,
    meetingId: consents.meetingId,
    wsId: consents.wsId,
    consentedAccountIds: consented,
    readerAccountIds: readers,
    queuedAt: now,
    attempts: 0,
    nextAttemptAt: now + MEET_FINALIZE_FIRST_DELAY_MS,
    status: 'pending',
  };
  return {
    ...state,
    finalizations: Object.fromEntries(
      [...pending, ...settled, record].map((entry) => [entry.sessionId, entry])
    ),
  };
}

export function finalizationDeadline(state: MeetFinalizationState) {
  const times = Object.values(state.finalizations ?? {})
    .filter((entry) => entry.status === 'pending')
    .map((entry) => entry.nextAttemptAt);
  return times.length ? Math.min(...times) : undefined;
}

/** When the room must wake to deliver, or undefined when delivery is off or idle. */
export function finalizationWake(
  state: MeetFinalizationState,
  url: string | undefined
) {
  return url ? finalizationDeadline(state) : undefined;
}

export function dueFinalizations(state: MeetFinalizationState, now: number) {
  return Object.values(state.finalizations ?? {})
    .filter((entry) => entry.status === 'pending' && entry.nextAttemptAt <= now)
    .sort((a, b) => a.nextAttemptAt - b.nextAttemptAt);
}

/**
 * Spend one attempt and schedule the next before any request is sent. When the
 * budget is spent the record is abandoned and nothing is delivered.
 */
export function beginFinalizationAttempt<T extends MeetFinalizationState>(
  state: T,
  sessionId: string,
  now: number
): { state: T; record: MeetFinalization | null } {
  const entry = state.finalizations?.[sessionId];
  if (!entry || entry.status !== 'pending' || entry.nextAttemptAt > now)
    return { state, record: null };
  const attempts = entry.attempts + 1;
  if (attempts > MEET_FINALIZE_MAX_ATTEMPTS)
    return {
      state: replaceFinalization(state, { ...entry, status: 'abandoned' }),
      record: null,
    };
  const next: MeetFinalization = {
    ...entry,
    attempts,
    nextAttemptAt:
      now +
      MEET_FINALIZE_BACKOFF_MS[
        Math.min(attempts - 1, MEET_FINALIZE_BACKOFF_MS.length - 1)
      ]!,
  };
  return { state: replaceFinalization(state, next), record: next };
}

export function settleFinalization<T extends MeetFinalizationState>(
  state: T,
  sessionId: string,
  outcome: MeetFinalizeDelivery
): T {
  const entry = state.finalizations?.[sessionId];
  if (!entry || entry.status !== 'pending') return state;
  if (outcome === 'done')
    return replaceFinalization(state, { ...entry, status: 'done' });
  if (outcome === 'fatal' || entry.attempts >= MEET_FINALIZE_MAX_ATTEMPTS)
    return replaceFinalization(state, { ...entry, status: 'abandoned' });
  return state;
}

function replaceFinalization<T extends MeetFinalizationState>(
  state: T,
  entry: MeetFinalization
): T {
  return {
    ...state,
    finalizations: { ...state.finalizations, [entry.sessionId]: entry },
  };
}


export type MeetFinalizeDelivery = 'done' | 'retry' | 'fatal';
