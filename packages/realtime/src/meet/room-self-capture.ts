import { z } from 'zod';
import type { MeetAiGateEnv } from './ai-workspace-gate';
import { MEET_CLASS_COHOST_SCOPE } from './class-timer';
import { isMeetAiPerSpeakerEnabled } from './per-speaker-gate';
import type { MeetRealtimeTokenPayload } from './primitives';
import {
  ackSelfOutbox,
  isRevoked,
  nextSeq,
  SELF_OUTBOX_MAX_ENTRIES,
  currentAcceptanceRevision,
  emptySelfCapture,
  endSelfCaptureSession,
  isPresent,
  isSelfSessionLive,
  pendingFor,
  SELF_CAPTURE_DRAIN_MS,
  SELF_CAPTURE_MAX_ACCOUNTS,
  SELF_CAPTURE_MAX_ALLOWS,
  type SelfCaptureAccount,
  type SelfCaptureState,
  selfConsentHeld,
  settleSelfCapture,
  takeBucket,
  withdraw,
  endStream,
} from './room-self-capture-state';
import type { RoomServiceState } from './room-service';
import {
  applyMeetTranscriptConsent,
  MEET_TRANSCRIPT_NOTICE_VERSION,
} from './room-transcript-consent';

type Result = { state: RoomServiceState; body: unknown; status?: number };

const session = z.uuid();
const command = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('transcript.mode.set'),
    mode: z.enum(['room', 'self']),
  }),
  z.object({
    action: z.literal('transcript.session'),
    sessionId: session,
    active: z.boolean(),
    protocol: z.enum(['legacy', 'self_v1']).default('legacy'),
    generation: z.number().int().nonnegative().default(0),
  }),
  z.object({
    action: z.literal('transcription.self.openBegin'),
    sessionId: session,
  }),
  z.object({
    action: z.literal('transcription.self.openCommit'),
    sessionId: session,
    epoch: z.number().int().positive(),
    revision: z.number().int().positive(),
    streamId: z.uuid(),
  }),
  z.object({
    action: z.literal('transcription.self.authorize'),
    sessionId: session,
    streamId: z.uuid(),
    consentRevision: z.number().int().positive(),
    spend: z.boolean(),
  }),
  z.object({
    action: z.literal('transcription.self.ack'),
    sessionId: session,
    entries: z
      .array(
        z.object({
          accountId: z.uuid(),
          seq: z.number().int().positive(),
          sessionId: session.optional(),
        })
      )
      .max(512),
  }),
]);
type Command = z.infer<typeof command>;

const isManager = (token: MeetRealtimeTokenPayload) =>
  token.guest !== true &&
  token.participantKind !== 'guest' &&
  (token.role === 'host' || token.scopes.includes(MEET_CLASS_COHOST_SCOPE));

/** A legacy or self_v1 session is running or draining. */
function modeLocked(state: RoomServiceState, now: number) {
  return (
    (!state.ended && !!state.transcriptConsent?.active) ||
    isSelfSessionLive(state.selfCapture?.session, now)
  );
}

/**
 * Per-speaker commands from the Meet Worker (`meet:server`) for the token's
 * own account, or null for any other command. Refusals that the Worker must
 * still drain answer 200 with `allowed: false` and the pending entries.
 */
export function applySelfCapture(
  input: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  raw: unknown,
  env: MeetAiGateEnv,
  now = Date.now()
): Result | null {
  const parsed = command.safeParse(raw);
  if (!parsed.success) return null;
  if (!token.scopes.includes('meet:server'))
    return { state: input, body: { error: 'Forbidden' }, status: 403 };
  const state = settleSelfCapture(input, now);
  const message = parsed.data;
  const enabled = isMeetAiPerSpeakerEnabled(env, token.wsId);
  const capture = state.selfCapture ?? emptySelfCapture();
  const fail = (status: number, code: string, error = code) => ({
    state,
    body: { error, code },
    status,
  });
  if (message.action === 'transcript.mode.set') {
    if (!isManager(token)) return fail(403, 'Forbidden');
    if (capture.mode === message.mode)
      return { state, body: { mode: capture.mode } };
    if (modeLocked(state, now)) return fail(409, 'MEET_SELF_MODE_LOCKED');
    if (message.mode === 'self' && !enabled)
      return fail(412, 'MEET_SELF_UNAVAILABLE');
    return {
      state: { ...state, selfCapture: { ...capture, mode: message.mode } },
      body: { mode: message.mode },
    };
  }
  if (message.action === 'transcript.session')
    return recordSession(state, capture, token, message, enabled, now);
  const accountId = token.accountId ?? token.userId;
  if (message.action === 'transcription.self.ack') {
    const acked = ackSelfOutbox(
      capture,
      message.entries.map((entry) => ({
        sessionId: entry.sessionId ?? message.sessionId,
        accountId: entry.accountId,
        seq: entry.seq,
      })),
      now
    );
    return {
      state: acked === capture ? state : { ...state, selfCapture: acked },
      body: {},
    };
  }
  const current = capture.session;
  const refuse = (next: RoomServiceState, reason: string) => ({
    state: next,
    body: {
      allowed: false,
      ...(message.action === 'transcription.self.openCommit'
        ? { committed: false }
        : {}),
      reason,
      pending: pendingFor(next.selfCapture, accountId),
    },
  });
  if (message.action === 'transcription.self.openCommit')
    return commit(state, capture, accountId, message, now);
  // A room that never recorded a self_v1 session keeps no per-speaker state.
  if (!current) return refuse(state, 'no_session');
  if (message.action === 'transcription.self.authorize') {
    let next = state;
    if (message.spend) {
      const buckets = takeBucket(capture.buckets, accountId, 'chunk', now);
      if (!buckets) return refuse(state, 'rate_limited');
      next = { ...state, selfCapture: { ...capture, buckets } };
    }
    if (!enabled) return refuse(next, 'unavailable');
    if (
      current?.sessionId !== message.sessionId ||
      !isSelfSessionLive(current, now)
    )
      return refuse(next, 'no_session');
    const account = capture.accounts[accountId];
    if (isRevoked(capture, accountId)) return refuse(next, 'revoked');
    if (!isPresent(state, accountId)) return refuse(next, 'not_present');
    if (!selfConsentHeld(state, current.meetingId, accountId))
      return refuse(next, 'consent');
    if (
      account?.committed?.streamId !== message.streamId ||
      account.committed.revision !== message.consentRevision
    )
      return refuse(next, 'stream');
    return {
      state: next,
      body: {
        allowed: true,
        generation: current.generation,
        pending: pendingFor(next.selfCapture, accountId),
      },
    };
  }
  // openBegin
  const buckets = takeBucket(capture.buckets, accountId, 'open', now);
  if (!buckets) return refuse(state, 'rate_limited');
  const spent = { ...state, selfCapture: { ...capture, buckets } };
  if (!enabled || capture.mode !== 'self') return refuse(spent, 'unavailable');
  if (current?.sessionId !== message.sessionId || current.status !== 'active')
    return refuse(spent, 'no_session');
  if (token.guest === true || token.participantKind === 'guest')
    return refuse(spent, 'guest');
  const account = capture.accounts[accountId];
  if (isRevoked(capture, accountId)) return refuse(spent, 'revoked');
  if (!isPresent(state, accountId)) return refuse(spent, 'not_present');
  if (!selfConsentHeld(state, current.meetingId, accountId))
    return refuse(spent, 'consent');
  // The outbox never drops an entry, so new opens stop before it grows past
  // its bound.
  if (
    capture.outbox.length >= SELF_OUTBOX_MAX_ENTRIES ||
    (!account &&
      Object.keys(capture.accounts).length >= SELF_CAPTURE_MAX_ACCOUNTS)
  )
    return refuse(spent, 'capacity');
  const base: SelfCaptureAccount = account ?? { epoch: 0, seq: 0, allows: 0 };
  if (!base.legalAllow && base.allows >= SELF_CAPTURE_MAX_ALLOWS)
    return refuse(spent, 'allow_limit');
  const seq = nextSeq(capture, base);
  const epoch = base.epoch + 1;
  const { committed: _, ...kept } = base;
  const opened: SelfCaptureAccount = {
    ...kept,
    seq,
    epoch,
    allows: base.legalAllow ? base.allows : base.allows + 1,
    legalAllow: base.legalAllow ?? {
      seq,
      noticeVersion: MEET_TRANSCRIPT_NOTICE_VERSION,
    },
    begun: { epoch, seq, acceptanceRevision: currentAcceptanceRevision(state) },
    lastBegin: { epoch, seq },
  };
  const selfCapture = {
    ...capture,
    buckets,
    seqCounter: seq,
    accounts: { ...capture.accounts, [accountId]: opened },
  };
  return {
    state: { ...state, selfCapture },
    body: {
      allowed: true,
      epoch,
      allowSeq: seq,
      generation: current.generation,
      noticeVersion: opened.legalAllow!.noticeVersion,
      pending: pendingFor(selfCapture, accountId),
    },
  };
}

/**
 * Stores the stream only while the epoch, the live fence and the acceptance
 * are unchanged since begin. Otherwise queues a compensating entry with a
 * higher sequence number, unless one queued after this begin already ends
 * the stream.
 */
function commit(
  state: RoomServiceState,
  capture: SelfCaptureState,
  accountId: string,
  message: Extract<Command, { action: 'transcription.self.openCommit' }>,
  now: number
): Result {
  const current = capture.session;
  const account = capture.accounts[accountId];
  const begun = account?.begun?.epoch === message.epoch ? account.begun : null;
  const last =
    account?.lastBegin?.epoch === message.epoch ? account.lastBegin : null;
  const done = account?.committed;
  // A retried commit of the stored stream is a no-op.
  if (
    done?.epoch === message.epoch &&
    done.streamId === message.streamId &&
    done.revision === message.revision &&
    account!.epoch === message.epoch &&
    current?.sessionId === message.sessionId
  )
    return { state, body: { committed: true } };
  if (
    account &&
    begun &&
    account.epoch === message.epoch &&
    current?.sessionId === message.sessionId &&
    current.status === 'active' &&
    isPresent(state, accountId) &&
    selfConsentHeld(state, current.meetingId, accountId) &&
    begun.acceptanceRevision === currentAcceptanceRevision(state)
  ) {
    const { begun: _, ...rest } = account;
    return {
      state: {
        ...state,
        selfCapture: {
          ...capture,
          accounts: {
            ...capture.accounts,
            [accountId]: {
              ...rest,
              committed: {
                epoch: message.epoch,
                revision: message.revision,
                streamId: message.streamId,
              },
            },
          },
        },
      },
      body: { committed: true },
    };
  }
  let next = capture;
  // An entry queued after this begin already ends stream S.
  const covered =
    !!last &&
    capture.outbox.some(
      (entry) =>
        entry.sessionId === message.sessionId &&
        entry.accountId === accountId &&
        entry.seq > last.seq
    );
  // While consent is still held a close ends S (for example a stale second
  // device); only a lost consent needs a withdraw.
  if (account && current?.sessionId === message.sessionId && !covered)
    next =
      account.legalAllow &&
      !selfConsentHeld(state, current.meetingId, accountId)
        ? withdraw(capture, accountId, now)
        : endStream(capture, accountId, 'close', now, true);
  return {
    state: next === capture ? state : { ...state, selfCapture: next },
    body: { committed: false, pending: pendingFor(next, accountId) },
  };
}

function recordSession(
  state: RoomServiceState,
  capture: SelfCaptureState,
  token: MeetRealtimeTokenPayload,
  message: Extract<Command, { action: 'transcript.session' }>,
  enabled: boolean,
  now: number
): Result {
  const { protocol, generation, ...legacy } = message;
  const mismatch = (status: number, code: string) => ({
    state,
    body: { error: code, code },
    status,
  });
  if (message.active) {
    if (protocol === 'self_v1' && !enabled)
      return mismatch(412, 'MEET_SELF_UNAVAILABLE');
    if ((protocol === 'self_v1') !== (capture.mode === 'self'))
      return mismatch(409, 'MEET_SELF_PROTOCOL_MISMATCH');
  }
  const existing = capture.session;
  if (message.active && protocol === 'self_v1') {
    const accountId = token.accountId ?? token.userId;
    const same = existing?.sessionId === message.sessionId;
    // Re-recording belongs to the session's host; starting one to a manager.
    if (same ? existing.hostAccountId !== accountId : !isManager(token))
      return mismatch(403, 'Forbidden');
    // One live session at a time, and an ended session never restarts, so
    // its ledger and outbox order are never reset.
    if (!same && capture.endedSessions?.includes(message.sessionId))
      return mismatch(409, 'MEET_SELF_SESSION_ENDED');
    if (!same && isSelfSessionLive(existing, now))
      return mismatch(409, 'MEET_SELF_SESSION_LIVE');
  }
  const result = applyMeetTranscriptConsent(state, token, legacy, now)!;
  if (result.status) return result;
  if (!message.active) {
    // The legacy handler ends only the session's own host's indicator.
    if (
      existing?.sessionId !== message.sessionId ||
      existing.status !== 'active' ||
      result.state.transcriptConsent?.active?.sessionId === message.sessionId
    )
      return result;
    return {
      ...result,
      state: {
        ...result.state,
        selfCapture: {
          ...capture,
          session: {
            ...existing,
            status: 'draining',
            drainUntil: now + SELF_CAPTURE_DRAIN_MS,
          },
        },
      },
    };
  }
  if (protocol !== 'self_v1') return result;
  const same = existing?.sessionId === message.sessionId;
  return {
    ...result,
    state: {
      ...result.state,
      selfCapture: {
        ...(same ? capture : endSelfCaptureSession(capture, now)!),
        // A new session starts an empty ledger. Revocations and the room
        // sequence counter are meeting-wide and carry over.
        ...(same ? {} : { accounts: {} }),
        session: {
          sessionId: message.sessionId,
          protocol: 'self_v1',
          generation: Math.max(generation, same ? existing.generation : 0),
          meetingId: token.meetingId,
          hostAccountId: same
            ? existing.hostAccountId
            : (token.accountId ?? token.userId),
          status: same ? existing.status : 'active',
          ...(same && existing.drainUntil
            ? { drainUntil: existing.drainUntil }
            : {}),
        },
      },
    },
  };
}
