import { createHash } from 'node:crypto';
import type { MastermindStore } from '@tuturuuu/utils/mastermind-store/client';
import type { FleetAnswerInput, FleetAnswerRecord } from './contract';

/**
 * Store pieces of secret answers (see store.ts for the answer records).
 *
 * The pending index lists secret decisions with an answer the orchestrator
 * has not acknowledged, each until its record expires. The answers pull
 * always covers it, so an accepted secret answer stays pullable however many
 * other decisions close meanwhile. Written with compare-and-set;
 * acknowledgement removes the id.
 */
export const SECRET_PENDING_KEY = 'mastermind:fleet:v1:secret-pending';
const SECRET_PENDING_TTL_MS = 2 * 60 * 60 * 1000;
const CAS_ATTEMPTS = 3;

interface PendingEntry {
  id: string;
  until: string;
}

type StoredEntry = NonNullable<FleetAnswerRecord['earlier']>[number];

export function livePending(raw: string | null, now: Date): PendingEntry[] {
  let value: { entries?: unknown } | null = null;
  try {
    value = raw === null ? null : JSON.parse(raw);
  } catch {
    value = null;
  }
  if (!Array.isArray(value?.entries)) return [];
  return (value.entries as PendingEntry[]).filter(
    (entry) =>
      typeof entry?.id === 'string' &&
      typeof entry?.until === 'string' &&
      Date.parse(entry.until) > now.getTime()
  );
}

/** Adds (with `until`) or removes (null) one id, with compare-and-set. */
export async function updateSecretPending(
  store: MastermindStore,
  decisionId: string,
  until: string | null,
  now: Date
) {
  for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
    const raw = await store.get(SECRET_PENDING_KEY);
    const kept = livePending(raw, now).filter(({ id }) => id !== decisionId);
    const entries = until ? [...kept, { id: decisionId, until }] : kept;
    if (
      await store.compareAndSet(
        SECRET_PENDING_KEY,
        raw,
        JSON.stringify({ entries }),
        SECRET_PENDING_TTL_MS
      )
    )
      return;
  }
  throw new Error('secret pending contention');
}

/**
 * SHA-256 hex of a secret answer's payload (sealed value, owner proof or
 * pairing answer), or undefined for an answer without one.
 */
export function answerPayloadDigest(
  answer: Pick<FleetAnswerInput, 'sealed' | 'owner' | 'pair'>
) {
  const { sealed, owner, pair } = answer;
  if (!sealed && !owner && !pair) return undefined;
  return createHash('sha256')
    .update(
      JSON.stringify([
        sealed?.enc ?? '',
        sealed?.ct ?? '',
        owner?.publicKey ?? '',
        owner?.keyId ?? '',
        owner?.signedAt ?? '',
        owner?.sig ?? '',
        pair?.ownerKey ?? '',
        pair?.ownerMac ?? '',
      ])
    )
    .digest('hex');
}

/** Drops the payload of an answer once revision `acked` is picked up. */
export function withoutPayload<T extends StoredEntry>(
  entry: T,
  acked: number
): T {
  if (entry.revision > acked) return entry;
  const { sealed: _s, owner: _o, pair: _p, ...rest } = entry;
  return rest as T;
}

export function withoutEarlier(
  answer: Omit<FleetAnswerRecord, 'pickedUpRevision' | 'pickedUpAt'>
): StoredEntry {
  const { earlier: _earlier, ...entry } = answer;
  return entry;
}

/** A secret record lives until `keepUntil`; others keep the default. */
export const secretTtl = (
  keepUntil: string | undefined,
  now: Date,
  fallbackMs: number
) =>
  keepUntil
    ? Math.max(1000, Date.parse(keepUntil) - now.getTime())
    : fallbackMs;
