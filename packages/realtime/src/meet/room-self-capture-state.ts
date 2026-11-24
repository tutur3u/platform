import type { MeetRoomSnapshot } from './room';
import {
  currentMiraRoomAcceptance,
  MIRA_ROOM_NOTICE_VERSION,
} from './room-mira-acceptance';
import type { MiraRoomState } from './room-mira-choices';
import {
  restartDelivery,
  type SelfOutboxDelivery,
} from './room-self-capture-cycle';
import {
  MEET_TRANSCRIPT_NOTICE_VERSION,
  type MeetTranscriptState,
} from './room-transcript-consent';

/**
 * Room authority for per-speaker (`self_v1`) transcription. The room is the
 * live consent fence; the database is the legal record, written only by the
 * Meet Worker. Every ending the room observes bumps the account's choice
 * epoch and appends an ordered entry to a per-account legal outbox with a
 * room sequence number. Sequence numbers come from one room-wide counter, so
 * they strictly increase per (session, account) across restores and even if
 * a session id is ever recorded again.
 */
export type SelfCaptureMode = 'room' | 'self';
export type SelfCaptureProtocol = 'legacy' | 'self_v1';
export type SelfOutboxKind = 'withdraw' | 'revoke' | 'close';
export type SelfOutboxEntry = {
  sessionId: string;
  accountId: string;
  seq: number;
  kind: SelfOutboxKind;
  noticeVersion?: string;
};
export type SelfCaptureBucket = { tokens: number; at: number };
/**
 * The notice an Allow was given under: its version, the locale shown and a
 * SHA-256 hex digest of the exact text. The room keeps no notice text.
 */
export type SelfAllowNotice = {
  noticeVersion: string;
  locale: string;
  textHash: string;
};
export type SelfCaptureAccount = {
  /** Choice epoch: grows on every ending and every new open. */
  epoch: number;
  /** Last room sequence number handed out to this account in the session. */
  seq: number;
  /** Allow sequence numbers issued after a transition out of allow. */
  allows: number;
  /** The legal record may hold an allow given at this seq and notice. */
  legalAllow?: { seq: number } & SelfAllowNotice;
  begun?: { epoch: number; seq: number; acceptanceRevision: number };
  /** The latest begin, kept after endings so a late commit can be fenced. */
  lastBegin?: { epoch: number; seq: number };
  committed?: { epoch: number; revision: number; streamId: string };
  /** Removed by a host or co-host: no further opens. */
  revoked?: true;
};
export type SelfCaptureSession = {
  sessionId: string;
  protocol: 'self_v1';
  generation: number;
  meetingId: string;
  hostAccountId: string;
  status: 'active' | 'draining' | 'ended';
  drainUntil?: number;
};
export type SelfCaptureState = {
  mode: SelfCaptureMode;
  session?: SelfCaptureSession;
  /** Ledger of the current self_v1 session, keyed by account. */
  accounts: Record<string, SelfCaptureAccount>;
  outbox: SelfOutboxEntry[];
  /** Notice evidence of each account's current per-speaker Allow. */
  allowNotices?: Record<string, SelfAllowNotice>;
  /** Room-wide room sequence counter; never decreases. */
  seqCounter?: number;
  /** Accounts a host or co-host removed; kept across sessions. */
  revoked?: Record<string, true>;
  /** Recent ended self_v1 session ids, which are never recorded again. */
  endedSessions?: string[];
  buckets?: Record<
    string,
    { chunk?: SelfCaptureBucket; open?: SelfCaptureBucket }
  >;
  /** Alarm delivery cycle of the current non-empty outbox. */
  delivery?: SelfOutboxDelivery;
};
export interface SelfCaptureRoomState {
  selfCapture?: SelfCaptureState;
}
type State = MeetRoomSnapshot & {
  miraRoom?: MiraRoomState;
  transcriptConsent?: MeetTranscriptState;
};

export const SELF_CAPTURE_DRAIN_MS = 20_000;
export const SELF_CAPTURE_MAX_ACCOUNTS = 24;
export const SELF_CAPTURE_MAX_ALLOWS = 10;
export const SELF_OUTBOX_MAX_ENTRIES = 512;
export const SELF_CAPTURE_MAX_REVOKED = 1024;
export const SELF_CAPTURE_MAX_ENDED_SESSIONS = 32;
export const SELF_CAPTURE_BUCKETS = {
  chunk: { burst: 3, refillMs: 10_000 },
  open: { burst: 3, refillMs: 30_000 },
} as const;

export const emptySelfCapture = (): SelfCaptureState => ({
  mode: 'room',
  accounts: {},
  outbox: [],
});

const accountOf = (person: { accountId?: string; userId: string }) =>
  person.accountId ?? person.userId;

/** Accepting uploads now: active, or draining before its deadline. */
export function isSelfSessionLive(
  session: SelfCaptureSession | undefined,
  now: number
): session is SelfCaptureSession {
  return (
    !!session &&
    (session.status === 'active' ||
      (session.status === 'draining' && now < (session.drainUntil ?? 0)))
  );
}

/** Client transcription state and speaker labels are refused in self mode. */
export function locksClientTranscription(state: SelfCaptureRoomState) {
  return (
    state.selfCapture?.mode === 'self' ||
    isSelfSessionLive(state.selfCapture?.session, Date.now())
  );
}

export function isPresent(state: MeetRoomSnapshot, accountId: string) {
  return (
    !state.ended &&
    Object.values(state.presence).some(
      (person) =>
        accountOf(person) === accountId && !state.waiting[person.userId]
    )
  );
}

/**
 * Consent half of the live fence: current Mira acceptance, the account's own
 * Mira choice on (no pending opt-out) and a transcript Allow on the current
 * notice, all for this meeting.
 */
export function selfConsentHeld(
  state: State,
  meetingId: string,
  accountId: string
) {
  const acceptance = currentMiraRoomAcceptance(state);
  const mira = state.miraRoom?.choices[accountId];
  const transcript = state.transcriptConsent?.choices[accountId];
  return !!(
    acceptance &&
    !state.miraRoom?.pending?.[accountId] &&
    mira?.choice === 'on' &&
    mira.accountId === accountId &&
    mira.meetingId === meetingId &&
    mira.version === MIRA_ROOM_NOTICE_VERSION &&
    mira.acceptanceRevision === acceptance.revision &&
    transcript?.choice === 'allow' &&
    transcript.accountId === accountId &&
    transcript.meetingId === meetingId &&
    transcript.version === MEET_TRANSCRIPT_NOTICE_VERSION
  );
}

/** Takes one token, refilling by elapsed time. Null when empty. */
export function takeBucket(
  buckets: SelfCaptureState['buckets'],
  accountId: string,
  kind: keyof typeof SELF_CAPTURE_BUCKETS,
  now: number
): SelfCaptureState['buckets'] | null {
  const { burst, refillMs } = SELF_CAPTURE_BUCKETS[kind];
  const current = buckets?.[accountId]?.[kind];
  const elapsed = current ? Math.max(0, now - current.at) : 0;
  const refilled = current
    ? Math.min(burst, current.tokens + Math.floor(elapsed / refillMs))
    : burst;
  if (refilled < 1) return null;
  // Keep the partial refill interval so tokens never arrive early.
  const at =
    current && refilled < burst
      ? current.at + Math.floor(elapsed / refillMs) * refillMs
      : now;
  return {
    ...pruneBuckets(buckets, now),
    [accountId]: {
      ...buckets?.[accountId],
      [kind]: { tokens: refilled - 1, at },
    },
  };
}

/** Drops buckets that have refilled completely, which keeps state bounded. */
function pruneBuckets(buckets: SelfCaptureState['buckets'], now: number) {
  const full = (
    kind: keyof typeof SELF_CAPTURE_BUCKETS,
    b?: SelfCaptureBucket
  ) =>
    !b ||
    b.tokens +
      Math.floor(
        Math.max(0, now - b.at) / SELF_CAPTURE_BUCKETS[kind].refillMs
      ) >=
      SELF_CAPTURE_BUCKETS[kind].burst;
  return Object.fromEntries(
    Object.entries(buckets ?? {}).filter(
      ([, b]) => !(full('chunk', b.chunk) && full('open', b.open))
    )
  );
}

/**
 * Appends one entry with the account's next sequence number. A stream entry
 * replaces a pending close of the same session, and nothing follows a
 * pending revoke, so each account holds at most one stream entry.
 */
export function enqueue(
  capture: SelfCaptureState,
  accountId: string,
  kind: SelfOutboxKind,
  now: number,
  noticeVersion?: string
): SelfCaptureState {
  const session = capture.session;
  const account = capture.accounts[accountId];
  if (!session || !account) return capture;
  const sameStream = (entry: SelfOutboxEntry) =>
    entry.sessionId === session.sessionId &&
    entry.accountId === accountId &&
    entry.kind !== 'withdraw';
  let outbox = capture.outbox;
  if (kind !== 'withdraw') {
    if (outbox.some((e) => sameStream(e) && e.kind === 'revoke'))
      return capture;
    outbox = outbox.filter((e) => !sameStream(e));
  }
  const seq = nextSeq(capture, account);
  return {
    ...capture,
    seqCounter: seq,
    accounts: {
      ...capture.accounts,
      [accountId]: { ...account, seq, epoch: account.epoch + 1 },
    },
    outbox: [
      ...outbox,
      {
        sessionId: session.sessionId,
        accountId,
        seq,
        kind,
        ...(noticeVersion ? { noticeVersion } : {}),
      },
    ],
    delivery: restartDelivery(capture.delivery, now),
  };
}

/** The next room sequence number; above every number already handed out. */
export function nextSeq(capture: SelfCaptureState, account?: { seq: number }) {
  return Math.max(capture.seqCounter ?? 0, account?.seq ?? 0) + 1;
}

export const isRevoked = (capture: SelfCaptureState, accountId: string) =>
  !!capture.revoked?.[accountId] || !!capture.accounts[accountId]?.revoked;

/** Withdraws a possible legal allow and forgets the account's stream. */
export function withdraw(
  capture: SelfCaptureState,
  accountId: string,
  now: number
): SelfCaptureState {
  const account = capture.accounts[accountId];
  if (!account?.legalAllow) return capture;
  const next = enqueue(
    capture,
    accountId,
    'withdraw',
    now,
    account.legalAllow.noticeVersion
  );
  const {
    legalAllow: _,
    begun: __,
    committed: ___,
    ...rest
  } = next.accounts[accountId]!;
  return {
    ...next,
    accounts: { ...next.accounts, [accountId]: rest },
    allowNotices: withoutNotice(next.allowNotices, accountId),
  };
}

function withoutNotice(
  notices: SelfCaptureState['allowNotices'],
  accountId: string
) {
  if (!notices?.[accountId]) return notices;
  const { [accountId]: _, ...rest } = notices;
  return rest;
}

/** Drops notice evidence for every account whose Allow is no longer current. */
export function pruneAllowNotices<T extends State & SelfCaptureRoomState>(
  state: T
): T {
  const notices = state.selfCapture?.allowNotices;
  if (!notices) return state;
  const kept = Object.fromEntries(
    Object.entries(notices).filter(([accountId]) => {
      const choice = state.transcriptConsent?.choices[accountId];
      return (
        choice?.choice === 'allow' &&
        choice.version === MEET_TRANSCRIPT_NOTICE_VERSION
      );
    })
  );
  return Object.keys(kept).length === Object.keys(notices).length
    ? state
    : { ...state, selfCapture: { ...state.selfCapture!, allowNotices: kept } };
}

/** Closes (or revokes) the account's stream and forgets it. */
export function endStream(
  capture: SelfCaptureState,
  accountId: string,
  kind: 'close' | 'revoke',
  now: number,
  force = false
): SelfCaptureState {
  const account = capture.accounts[accountId];
  if (
    !account ||
    (kind === 'close' && !force && !account.begun && !account.committed)
  )
    return capture;
  const next = enqueue(capture, accountId, kind, now);
  const { begun: _, committed: __, ...rest } = next.accounts[accountId]!;
  return {
    ...next,
    accounts: {
      ...next.accounts,
      [accountId]: kind === 'revoke' ? { ...rest, revoked: true } : rest,
    },
  };
}

/** Ends the room's self_v1 session; stream holders get a close entry. */
export function endSelfCaptureSession(
  capture: SelfCaptureState | undefined,
  now: number
): SelfCaptureState | undefined {
  if (!capture?.session || capture.session.status === 'ended') return capture;
  let next = capture;
  for (const accountId of Object.keys(capture.accounts))
    next = endStream(next, accountId, 'close', now);
  return {
    ...next,
    session: { ...next.session!, status: 'ended' },
    endedSessions: [
      ...(next.endedSessions ?? []).filter(
        (id) => id !== capture.session!.sessionId
      ),
      capture.session.sessionId,
    ].slice(-SELF_CAPTURE_MAX_ENDED_SESSIONS),
  };
}

/**
 * Applies every room-side ending the state shows: a consent ending
 * (untick, Mira off for me, Mira turned off, minor report, notice change)
 * queues a withdraw; leave or heartbeat expiry closes the stream; room end
 * ends the session. Idempotent; returns the same object when unchanged.
 */
export function settleSelfCapture<T extends State & SelfCaptureRoomState>(
  input: T,
  now = Date.now()
): T {
  const state = pruneAllowNotices(input);
  const capture = state.selfCapture;
  const session = capture?.session;
  if (!capture || !session || session.status === 'ended') return state;
  if (state.ended)
    return { ...state, selfCapture: endSelfCaptureSession(capture, now) };
  if (!isSelfSessionLive(session, now)) return state;
  let next = capture;
  for (const [accountId, account] of Object.entries(capture.accounts)) {
    if (
      account.legalAllow &&
      !selfConsentHeld(state, session.meetingId, accountId)
    )
      next = withdraw(next, accountId, now);
    else if (
      (account.begun || account.committed) &&
      !isPresent(state, accountId)
    )
      next = endStream(next, accountId, 'close', now);
  }
  return next === capture ? state : { ...state, selfCapture: next };
}

/**
 * A host or co-host removed the account during a live session: its upload
 * grant is revoked and it can never open again in this meeting. Only an
 * account with a ledger entry needs a legal revoke entry.
 */
export function revokeSelfCapture<T extends SelfCaptureRoomState>(
  state: T,
  accountId: string,
  now = Date.now()
): T {
  const capture = state.selfCapture;
  if (!capture || !isSelfSessionLive(capture.session, now)) return state;
  const revoked =
    capture.revoked?.[accountId] ||
    Object.keys(capture.revoked ?? {}).length >= SELF_CAPTURE_MAX_REVOKED
      ? capture.revoked
      : { ...capture.revoked, [accountId]: true as const };
  const next = capture.accounts[accountId]
    ? endStream(capture, accountId, 'revoke', now)
    : capture;
  if (next === capture && revoked === capture.revoked) return state;
  return { ...state, selfCapture: { ...next, revoked } };
}

/**
 * Removes exactly the acknowledged entries. Progress restarts the delivery
 * cycle; the cycle ends when the outbox is empty.
 */
export function ackSelfOutbox(
  capture: SelfCaptureState,
  acked: ReadonlyArray<{ sessionId: string; accountId: string; seq: number }>,
  now: number
): SelfCaptureState {
  const keys = new Set(
    acked.map((e) => `${e.sessionId}:${e.accountId}:${e.seq}`)
  );
  const outbox = capture.outbox.filter(
    (e) => !keys.has(`${e.sessionId}:${e.accountId}:${e.seq}`)
  );
  if (outbox.length === capture.outbox.length) return capture;
  const { delivery, ...rest } = capture;
  if (!outbox.length) return { ...rest, outbox };
  const waiting = new Set(outbox.map((entry) => entry.accountId));
  const failures = Object.fromEntries(
    Object.entries(delivery?.failures ?? {}).filter(([id]) => waiting.has(id))
  );
  const restarted = restartDelivery(delivery, now);
  delete restarted.failures;
  return {
    ...rest,
    outbox,
    delivery: Object.keys(failures).length
      ? { ...restarted, failures }
      : restarted,
  };
}

/** The caller's own entries, then up to `others` entries of other accounts. */
export function pendingFor(
  capture: SelfCaptureState | undefined,
  accountId: string,
  others = 32
): SelfOutboxEntry[] {
  let budget = others;
  return (capture?.outbox ?? []).filter((entry) => {
    if (entry.accountId === accountId) return true;
    if (budget <= 0) return false;
    budget--;
    return true;
  });
}

export function currentAcceptanceRevision(state: State) {
  return currentMiraRoomAcceptance(state)?.revision ?? 0;
}
