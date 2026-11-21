import { createHash } from 'node:crypto';
import type { MastermindStore } from '@tuturuuu/utils/mastermind-store/client';
import type {
  FleetAnswerInput,
  FleetAnswerRecord,
  FleetState,
} from './contract';

export const FLEET_STATE_KEY = 'mastermind:fleet:v1:state';
const ANSWER_PREFIX = 'mastermind:fleet:v1:answer:';
const ACK_PREFIX = 'mastermind:fleet:v1:ack:';
const NONCE_PREFIX = 'mastermind:fleet:v1:nonce:';
const STATE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const NONCE_TTL_MS = 15 * 60 * 1000;
/** The phone polls every 15 s; one store read per colo per 5 s serves them all. */
export const FLEET_READ_CACHE_MS = 5000;
const CAS_ATTEMPTS = 3;
const MGET_CHUNK = 64;

/**
 * Decisions closed in the last 48 hours, with when they closed, kept under
 * their own small key. The answers pull covers these as well as the open
 * decisions, so an answer outlives its decision leaving the snapshot
 * (closed elsewhere, or a fallback publish) between the owner's tap and the
 * next pickup. Only the publisher's PUT writes it, with a compare-and-set,
 * before it writes the snapshot; answers and acknowledgements never touch
 * it. Open decisions are listed too but never count against the cap.
 */
export interface RecentDecision {
  id: string;
  seenAt: string;
  /** Present in a stored snapshot, so the owner could have answered it. */
  stored?: true;
}
interface RecentRecord {
  /** `generatedAt` of the newest snapshot accepted. */
  generatedAt?: string;
  entries: RecentDecision[];
}
const RECENT_KEY = 'mastermind:fleet:v1:recent';
const RECENT_WINDOW_MS = 48 * 60 * 60 * 1000;
/** Closed decisions kept; open ones are always kept on top. */
const RECENT_CLOSED_MAX = 200;
/** A stored generation this far ahead of the server clock is ignored. */
const FUTURE_SKEW_MS = 5 * 60 * 1000;

export class StaleFleetSnapshotError extends Error {
  constructor() {
    super('stale snapshot');
  }
}

export interface StoredFleetState {
  state: FleetState;
  etag: string;
  receivedAt: string;
}

function parseRecent(raw: string | null): RecentRecord {
  const value = parseJson<RecentRecord>(raw);
  const entries = Array.isArray(value?.entries)
    ? value.entries.filter(
        (entry) =>
          typeof entry?.id === 'string' && typeof entry?.seenAt === 'string'
      )
    : [];
  return {
    ...(typeof value?.generatedAt === 'string'
      ? { generatedAt: value.generatedAt }
      : {}),
    entries,
  };
}

function mergeRecent(
  recent: RecentDecision[],
  prior: StoredFleetState | null,
  state: FleetState,
  now: Date
): RecentDecision[] {
  const seenAt = now.toISOString();
  const byId = new Map<string, RecentDecision>();
  for (const entry of recent) byId.set(entry.id, entry);
  // Decisions in the snapshot being replaced were stored, and open (and
  // answerable) until this moment, including in a snapshot written before
  // this list existed or after a long publisher outage.
  for (const { id } of prior?.state.decisions ?? [])
    byId.set(id, { id, seenAt, stored: true });
  const open = new Set(state.decisions.map(({ id }) => id));
  for (const id of open)
    byId.set(id, {
      id,
      seenAt,
      ...(byId.get(id)?.stored ? { stored: true as const } : {}),
    });
  const horizon = now.getTime() - RECENT_WINDOW_MS;
  // Only decisions some stored snapshot carried can hold an answer, so an
  // id from a publish whose snapshot write failed never takes a slot.
  const closed = [...byId.values()]
    .filter(
      (entry) =>
        !open.has(entry.id) &&
        entry.stored &&
        Date.parse(entry.seenAt) >= horizon
    )
    .sort((a, b) => b.seenAt.localeCompare(a.seenAt))
    .slice(0, RECENT_CLOSED_MAX);
  return [...[...open].map((id) => byId.get(id)!), ...closed];
}

/** Ids an answers pull covers: open decisions plus recently closed ones. */
export async function answerableDecisionIds(
  store: MastermindStore,
  stored: StoredFleetState | null
) {
  const { entries } = parseRecent(await store.get(RECENT_KEY));
  return [
    ...new Set([
      ...(stored?.state.decisions.map(({ id }) => id) ?? []),
      ...entries.map(({ id }) => id),
    ]),
  ];
}

type StoredAnswer = Omit<FleetAnswerRecord, 'pickedUpRevision' | 'pickedUpAt'>;
type StoredAck = { revision: number; at: string };

function parseJson<T>(value: string | null): T | null {
  if (value === null) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function fleetEtag(state: FleetState) {
  // generatedAt is excluded so a heartbeat with unchanged content keeps the
  // phone's cached copy valid; receivedAt still advances for freshness.
  const { generatedAt: _generatedAt, ...content } = state;
  return `"${createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 32)}"`;
}

export async function readFleetState(
  store: MastermindStore,
  options: { cached?: boolean } = {}
) {
  return parseJson<StoredFleetState>(
    await store.get(
      FLEET_STATE_KEY,
      options.cached ? { cacheMs: FLEET_READ_CACHE_MS } : undefined
    )
  );
}

/**
 * Records the snapshot's decisions in the recent list (compare-and-set on
 * its own small key, so overlapping publishes keep each other's entries),
 * then replaces the snapshot. A snapshot generated before the newest one
 * accepted is refused, so a delayed publish cannot reopen a decision a
 * later one closed. A failed read throws (503, the publisher retries)
 * rather than reset the list.
 */
export async function writeFleetState(
  store: MastermindStore,
  state: FleetState,
  now = new Date()
): Promise<StoredFleetState> {
  let recorded = false;
  for (let attempt = 0; attempt < CAS_ATTEMPTS && !recorded; attempt++) {
    const [recentRaw, priorRaw] = await store.mget([
      RECENT_KEY,
      FLEET_STATE_KEY,
    ]);
    const recent = parseRecent(recentRaw ?? null);
    const newest = recent.generatedAt ? Date.parse(recent.generatedAt) : NaN;
    if (
      newest <= now.getTime() + FUTURE_SKEW_MS &&
      Date.parse(state.generatedAt) < newest
    )
      throw new StaleFleetSnapshotError();
    const next: RecentRecord = {
      generatedAt: state.generatedAt,
      entries: mergeRecent(
        recent.entries,
        parseJson<StoredFleetState>(priorRaw ?? null),
        state,
        now
      ),
    };
    recorded = await store.compareAndSet(
      RECENT_KEY,
      recentRaw ?? null,
      JSON.stringify(next),
      STATE_TTL_MS
    );
  }
  if (!recorded) throw new Error('recent contention');
  const stored: StoredFleetState = {
    state,
    etag: fleetEtag(state),
    receivedAt: now.toISOString(),
  };
  await store.set(FLEET_STATE_KEY, JSON.stringify(stored), {
    ttlMs: STATE_TTL_MS,
  });
  return stored;
}

/** Claims a publisher signature once; a replay inside the window is refused. */
export function claimFleetNonce(store: MastermindStore, signature: string) {
  return store.set(`${NONCE_PREFIX}${signature}`, '1', {
    ttlMs: NONCE_TTL_MS,
    nx: true,
  });
}

function merge(answer: StoredAnswer, ack: StoredAck | null): FleetAnswerRecord {
  const picked = ack && ack.revision <= answer.revision ? ack : null;
  return {
    ...answer,
    pickedUpRevision: picked?.revision ?? 0,
    ...(picked ? { pickedUpAt: picked.at } : {}),
  };
}

async function mgetAll(store: MastermindStore, keys: string[]) {
  const values: (string | null)[] = [];
  for (let i = 0; i < keys.length; i += MGET_CHUNK)
    values.push(...(await store.mget(keys.slice(i, i + MGET_CHUNK))));
  return values;
}

/** Latest answer and pickup per decision, for the given decision ids. */
export async function readFleetAnswers(
  store: MastermindStore,
  decisionIds: string[]
): Promise<Record<string, FleetAnswerRecord>> {
  if (decisionIds.length === 0) return {};
  const values = await mgetAll(store, [
    ...decisionIds.map((id) => `${ANSWER_PREFIX}${id}`),
    ...decisionIds.map((id) => `${ACK_PREFIX}${id}`),
  ]);
  const result: Record<string, FleetAnswerRecord> = {};
  decisionIds.forEach((id, index) => {
    const answer = parseJson<StoredAnswer>(values[index] ?? null);
    if (!answer) return;
    result[id] = merge(
      answer,
      parseJson<StoredAck>(values[decisionIds.length + index] ?? null)
    );
  });
  return result;
}

/** An Idempotency-Key reused by another actor or with another payload. */
export class FleetAnswerConflictError extends Error {
  constructor() {
    super('idempotency key reused');
  }
}

/** Same payload; empty values are not stored, so they compare as absent. */
function samePayload(stored: StoredAnswer, input: FleetAnswerInput) {
  return (
    stored.action === input.action &&
    (stored.optionId || null) === (input.optionId || null) &&
    (stored.text || null) === (input.text || null)
  );
}

/**
 * Records an owner answer. A retry by the same actor with the same
 * Idempotency-Key and payload returns the stored record unchanged; the same
 * key from another actor or with another payload throws
 * {@link FleetAnswerConflictError}. A record stored without an actor matches on
 * key and payload alone. A new key becomes the next revision, which the
 * orchestrator picks up again. Compare-and-set keeps revisions monotonic.
 */
export async function recordFleetAnswer(
  store: MastermindStore,
  decisionId: string,
  input: FleetAnswerInput,
  idempotencyKey: string,
  now = new Date(),
  actorId?: string
): Promise<FleetAnswerRecord> {
  const key = `${ANSWER_PREFIX}${decisionId}`;
  for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
    const [raw, ackRaw] = await store.mget([key, `${ACK_PREFIX}${decisionId}`]);
    const current = parseJson<StoredAnswer>(raw ?? null);
    const ack = parseJson<StoredAck>(ackRaw ?? null);
    if (current?.idempotencyKey === idempotencyKey) {
      const sameActor = !current.actorId || current.actorId === actorId;
      if (!sameActor || !samePayload(current, input))
        throw new FleetAnswerConflictError();
      return merge(current, ack);
    }
    const next: StoredAnswer = {
      decisionId,
      revision: (current?.revision ?? 0) + 1,
      action: input.action,
      ...(input.optionId ? { optionId: input.optionId } : {}),
      ...(input.text ? { text: input.text } : {}),
      idempotencyKey,
      ...(actorId ? { actorId } : {}),
      answeredAt: now.toISOString(),
    };
    if (
      await store.compareAndSet(
        key,
        raw ?? null,
        JSON.stringify(next),
        STATE_TTL_MS
      )
    )
      return merge(next, ack);
  }
  throw new Error('answer contention');
}

/**
 * The stored answer a retry repeats: the same actor, Idempotency-Key and
 * payload as the latest record for the decision. Lets a send whose response
 * was lost read its receipt after the decision closed. Anything else, a
 * record without an actor included, is null.
 */
export async function replayFleetAnswer(
  store: MastermindStore,
  decisionId: string,
  input: FleetAnswerInput,
  idempotencyKey: string,
  actorId: string
): Promise<FleetAnswerRecord | null> {
  const [raw, ackRaw] = await store.mget([
    `${ANSWER_PREFIX}${decisionId}`,
    `${ACK_PREFIX}${decisionId}`,
  ]);
  const current = parseJson<StoredAnswer>(raw ?? null);
  if (
    !current ||
    current.actorId !== actorId ||
    current.idempotencyKey !== idempotencyKey ||
    !samePayload(current, input)
  )
    return null;
  return merge(current, parseJson<StoredAck>(ackRaw ?? null));
}

/** Marks answers picked up; stale or repeated acks change nothing. */
export async function acknowledgeFleetAnswers(
  store: MastermindStore,
  acks: { decisionId: string; revision: number }[],
  now = new Date()
) {
  let changed = 0;
  for (const { decisionId, revision } of acks) {
    const ackKey = `${ACK_PREFIX}${decisionId}`;
    const [answerRaw, ackRaw] = await store.mget([
      `${ANSWER_PREFIX}${decisionId}`,
      ackKey,
    ]);
    const answer = parseJson<StoredAnswer>(answerRaw ?? null);
    const ack = parseJson<StoredAck>(ackRaw ?? null);
    if (
      !answer ||
      revision > answer.revision ||
      revision <= (ack?.revision ?? 0)
    )
      continue;
    const next: StoredAck = { revision, at: now.toISOString() };
    if (
      await store.compareAndSet(
        ackKey,
        ackRaw ?? null,
        JSON.stringify(next),
        STATE_TTL_MS
      )
    )
      changed++;
  }
  return changed;
}

/** Answers the orchestrator has not acknowledged at their current revision. */
export function pendingFleetAnswers(
  answers: Record<string, FleetAnswerRecord>
) {
  return Object.values(answers)
    .filter((answer) => answer.pickedUpRevision < answer.revision)
    .sort((a, b) => a.answeredAt.localeCompare(b.answeredAt));
}
