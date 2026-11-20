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

export interface StoredFleetState {
  state: FleetState;
  etag: string;
  receivedAt: string;
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

export async function writeFleetState(
  store: MastermindStore,
  state: FleetState,
  now = new Date()
): Promise<StoredFleetState> {
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

/**
 * Records an owner answer. A retry with the same Idempotency-Key returns the
 * stored record unchanged; a new key becomes the next revision, which the
 * orchestrator picks up again. Compare-and-set keeps revisions monotonic.
 */
export async function recordFleetAnswer(
  store: MastermindStore,
  decisionId: string,
  input: FleetAnswerInput,
  idempotencyKey: string,
  now = new Date()
): Promise<FleetAnswerRecord> {
  const key = `${ANSWER_PREFIX}${decisionId}`;
  for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
    const [raw, ackRaw] = await store.mget([key, `${ACK_PREFIX}${decisionId}`]);
    const current = parseJson<StoredAnswer>(raw ?? null);
    const ack = parseJson<StoredAck>(ackRaw ?? null);
    if (current?.idempotencyKey === idempotencyKey) return merge(current, ack);
    const next: StoredAnswer = {
      decisionId,
      revision: (current?.revision ?? 0) + 1,
      action: input.action,
      ...(input.optionId ? { optionId: input.optionId } : {}),
      ...(input.text ? { text: input.text } : {}),
      idempotencyKey,
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
