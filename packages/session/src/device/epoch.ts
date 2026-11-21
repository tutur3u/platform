/**
 * Epoch reads, the device epoch cache merge rule, and the fresh factor read
 * check, which follows the same freshness rule as an epoch read.
 */
import type { UserId } from '../principal';
import type {
  EpochCache,
  EpochRaise,
  EpochRead,
  FreshFactors,
  SessionFactor,
} from './types';

/** A fresh read is at most this old when a mutation or cache refresh uses it. */
export const FRESH_READ_MAX_AGE_MS = 5_000;
/** A `read` route may use the device cache entry while it is at most this old. */
export const EPOCH_CACHE_MAX_AGE_MS = 30_000;

/**
 * Whether `incoming` replaces `current`: only a higher epoch, or an equal one
 * read later. A versioned commit, a cache refresh and an epoch fan-out all
 * merge through this rule, so the cache never lowers.
 */
export function replacesEpochEntry(
  current: { epoch: number; readAtMs: number } | undefined,
  incoming: { epoch: number; readAtMs: number }
): boolean {
  if (!current) return true;
  return (
    incoming.epoch > current.epoch ||
    (incoming.epoch === current.epoch && incoming.readAtMs > current.readAtMs)
  );
}

/** The cache after merging `raises`, as one storage transaction applies them. */
export function mergeEpochCache(
  cache: EpochCache,
  raises: readonly EpochRaise[]
): EpochCache {
  const next: EpochCache = { ...cache };
  for (const raise of raises) {
    const entry = { epoch: raise.epoch, readAtMs: raise.readAtMs };
    if (replacesEpochEntry(next[raise.userId], entry))
      next[raise.userId] = entry;
  }
  return next;
}

function isFreshAt(readAtMs: number, nowMs: number): boolean {
  return (
    Number.isFinite(readAtMs) &&
    readAtMs <= nowMs &&
    nowMs - readAtMs <= FRESH_READ_MAX_AGE_MS
  );
}

/** The raise a `refreshEpochCache` call may merge, or null when it must be ignored. */
export function refreshRaise(
  read: EpochRead,
  nowMs: number
): EpochRaise | null {
  if (read.status !== 'fresh' || !validEpoch(read.epoch)) return null;
  if (!isFreshAt(read.readAtMs, nowMs)) return null;
  return { userId: read.userId, epoch: read.epoch, readAtMs: read.readAtMs };
}

export function validEpoch(epoch: unknown): epoch is number {
  return typeof epoch === 'number' && Number.isSafeInteger(epoch) && epoch >= 0;
}

export type EpochCheck =
  | { ok: true; epoch: number; raise: EpochRaise }
  | { ok: false; reason: 'invalid_operation' | 'epoch_unavailable' };

/**
 * A mutation's epoch read: for another user it is `invalid_operation`; a
 * `stale` or `unavailable` read fails closed with `epoch_unavailable`; a
 * fresh read older than 5 seconds is `invalid_operation`.
 */
export function checkEpochRead(
  read: EpochRead | null | undefined,
  userId: UserId,
  nowMs: number
): EpochCheck {
  if (!read || typeof read !== 'object')
    return { ok: false, reason: 'invalid_operation' };
  if (read.userId !== userId) return { ok: false, reason: 'invalid_operation' };
  if (read.status !== 'fresh')
    return { ok: false, reason: 'epoch_unavailable' };
  if (!validEpoch(read.epoch) || !isFreshAt(read.readAtMs, nowMs)) {
    return { ok: false, reason: 'invalid_operation' };
  }
  return {
    ok: true,
    epoch: read.epoch,
    raise: { userId, epoch: read.epoch, readAtMs: read.readAtMs },
  };
}

const METHODS = new Set(['totp', 'passkey']);
const ROLES = new Set(['second_factor', 'sign_in']);

/**
 * Builds the value a `FactorReadPort` returns. Ports call it; nothing else
 * should. It copies and freezes the factors and rejects malformed rows.
 */
export function freshFactors(input: {
  userId: UserId;
  readAtMs: number;
  factors: readonly SessionFactor[];
}): FreshFactors {
  const seen = new Set<string>();
  const factors = input.factors.map((factor) => {
    if (
      typeof factor.factorId !== 'string' ||
      factor.factorId.length === 0 ||
      seen.has(factor.factorId) ||
      !METHODS.has(factor.method) ||
      !ROLES.has(factor.role) ||
      // Every totp is a second factor.
      (factor.method === 'totp' && factor.role !== 'second_factor')
    ) {
      throw new TypeError('Invalid factor row');
    }
    seen.add(factor.factorId);
    return Object.freeze({ ...factor });
  });
  return Object.freeze({
    userId: input.userId,
    readAtMs: input.readAtMs,
    factors: Object.freeze(factors),
  }) as FreshFactors;
}

export type FactorCheck =
  | { ok: true; factors: SessionFactor[] }
  | { ok: false; reason: 'invalid_operation' | 'factors_unavailable' };

/** A fresh factor read for `userId`, at most 5 seconds before `nowMs`. */
export function checkFactorRead(
  read: FreshFactors | 'unavailable' | null | undefined,
  userId: UserId,
  nowMs: number
): FactorCheck {
  if (read === 'unavailable' || read == null) {
    return { ok: false, reason: 'factors_unavailable' };
  }
  if (read.userId !== userId || !isFreshAt(read.readAtMs, nowMs)) {
    return { ok: false, reason: 'invalid_operation' };
  }
  return { ok: true, factors: read.factors.map((factor) => ({ ...factor })) };
}
