/**
 * Live voice mint admission for the `live` family: a port of the Web app's
 * RESERVE_LIVE_MINT_SCRIPT onto the partition's `entries` table. The engine
 * runs it inside the partition's `transactionSync`, so the actor window, lease
 * concurrency and the global FREE budget are checked and charged atomically.
 *
 * The clock is the Durable Object's `Date.now()` (Redis TIME before). FREE
 * leases end at ICT midnight rather than charging a cross-day session to
 * either budget. A server-side failed mint can release its concurrency slot.
 * The rolling actor window and full lease reservation are still charged.
 *
 * Storage stays bounded: each actor has at most one window row and one lease
 * row, holding only entries still inside the 24 h window or an open lease, and
 * expiring with their last entry. Budget rows live until the end of the next
 * ICT day, so at most two days exist. Expired rows are purged per request and
 * by the partition alarm. Each tracked open lease has one expiring receipt.
 */
import type {
  GuardResult,
  ParsedGuardCommand,
} from '@tuturuuu/utils/abuse-guard/protocol';

export const LIVE_DAY_MS = 86_400_000;
/** Asia/Ho_Chi_Minh has no daylight saving: a fixed UTC+7 offset. */
export const LIVE_ICT_OFFSET_MS = 25_200_000;
/** Concurrency slots stay held this long after a lease's provider expiry. */
export const LIVE_LEASE_GRACE_MS = 30_000;

type LiveReserveCommand = Extract<ParsedGuardCommand, { op: 'live.reserve' }>;
type LiveReserveResult = Extract<GuardResult, { op: 'live.reserve' }>;
type LiveReleaseCommand = Extract<ParsedGuardCommand, { op: 'live.release' }>;
type Row = { v: string; exp: number };

export interface LiveRowStore {
  read(k: string, now: number): Row | null;
  write(k: string, v: string, exp: number): void;
  /** Builds the error that rolls the step back on a corrupt stored value. */
  invalid(message: string): Error;
}

type BudgetState = { s: number; a80?: 1; a100?: 1 };

export function ictDay(now: number) {
  return Math.floor((now + LIVE_ICT_OFFSET_MS) / LIVE_DAY_MS);
}

export function liveRowKeys(
  cmd: Pick<LiveReserveCommand, 'actor' | 'budget'>,
  day: number
) {
  return {
    actor: `live:a:${cmd.actor}`,
    leases: `live:l:${cmd.actor}`,
    budget: `live:b:${cmd.budget}:${day}`,
  };
}

function leaseReceipt(actor: string, lease: string) {
  return `live:r:${actor}:${lease}`;
}

function times(row: Row | null, store: LiveRowStore): number[] {
  if (!row) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.v);
  } catch {
    throw store.invalid('value is not a live list');
  }
  if (!Array.isArray(parsed) || !parsed.every(Number.isSafeInteger)) {
    throw store.invalid('value is not a live list');
  }
  return [...(parsed as number[])].sort((a, b) => a - b);
}

function budgetState(row: Row | null, store: LiveRowStore): BudgetState {
  if (!row) return { s: 0 };
  let parsed: BudgetState;
  try {
    parsed = JSON.parse(row.v) as BudgetState;
  } catch {
    throw store.invalid('value is not a live budget');
  }
  if (!Number.isSafeInteger(parsed?.s) || parsed.s < 0) {
    throw store.invalid('value is not a live budget');
  }
  return parsed;
}

function retryAfter(sorted: number[], offset: number, now: number) {
  const first = sorted[0];
  if (first === undefined) return 1;
  return Math.max(1, Math.ceil((first + offset - now) / 1000));
}

export function reserveLiveMint(
  cmd: LiveReserveCommand,
  now: number,
  store: LiveRowStore
): LiveReserveResult {
  const day = ictDay(now);
  const midnight = (day + 1) * LIVE_DAY_MS - LIVE_ICT_OFFSET_MS;
  const keys = liveRowKeys(cmd, day);
  const expiresAt = cmd.free
    ? Math.min(now + cmd.durationMs, midnight)
    : now + cmd.durationMs;
  const reserved = cmd.free
    ? Math.floor((Math.ceil((expiresAt - now) / 1000) * cmd.rate + 59) / 60)
    : 0;
  const budget = budgetState(store.read(keys.budget, now), store);
  const budgetExp = midnight + LIVE_DAY_MS;
  const mints = times(store.read(keys.actor, now), store).filter(
    (at) => at > now - LIVE_DAY_MS
  );
  const leases = times(store.read(keys.leases, now), store).filter(
    (end) => end > now
  );
  const denial = (
    reason: 'actor' | 'budget' | 'concurrency',
    retryAfterS: number,
    alert = 0
  ): LiveReserveResult => ({
    op: 'live.reserve',
    ok: false,
    reason,
    retryAfterS,
    spent: budget.s,
    limit: cmd.limit,
    alert,
    day,
  });

  if (mints.length >= cmd.actorLimit) {
    return denial('actor', retryAfter(mints, LIVE_DAY_MS, now));
  }
  if (leases.length >= cmd.concurrentLimit) {
    return denial('concurrency', retryAfter(leases, 0, now));
  }
  if (cmd.free && budget.s + reserved > cmd.limit) {
    let alert = 0;
    if (!budget.a100) {
      budget.a100 = 1;
      alert = 2;
      store.write(keys.budget, JSON.stringify(budget), budgetExp);
    }
    return denial(
      'budget',
      Math.max(1, Math.ceil((midnight - now) / 1000)),
      alert
    );
  }

  let alert = 0;
  if (cmd.free) {
    budget.s += reserved;
    if (budget.s >= Math.floor((cmd.limit * 4 + 4) / 5) && !budget.a80) {
      budget.a80 = 1;
      alert += 1;
    }
    if (budget.s >= cmd.limit && !budget.a100) {
      budget.a100 = 1;
      alert += 2;
    }
    store.write(keys.budget, JSON.stringify(budget), budgetExp);
  }
  mints.push(now);
  const end = expiresAt + LIVE_LEASE_GRACE_MS;
  leases.push(end);
  if (cmd.lease) store.write(leaseReceipt(cmd.actor, cmd.lease), '1', end);
  leases.sort((a, b) => a - b);
  store.write(keys.actor, JSON.stringify(mints), now + LIVE_DAY_MS + 1000);
  store.write(
    keys.leases,
    JSON.stringify(leases),
    (leases.at(-1) ?? now) + 1000
  );
  return {
    op: 'live.reserve',
    ok: true,
    at: now,
    expiresAt,
    reserved,
    spent: budget.s,
    limit: cmd.limit,
    alert,
    day,
  };
}

export function releaseLiveMint(
  cmd: LiveReleaseCommand,
  now: number,
  store: LiveRowStore & { remove(k: string): void }
): boolean {
  const receiptKey = leaseReceipt(cmd.actor, cmd.lease);
  const receipt = store.read(receiptKey, now);
  if (!receipt) return false;

  const leasesKey = `live:l:${cmd.actor}`;
  const row = store.read(leasesKey, now);
  const leases = times(row, store).filter((end) => end > now);
  const index = leases.indexOf(receipt.exp);
  if (index >= 0) {
    // Equal expiration times are interchangeable in this actor's lease count.
    leases.splice(index, 1);
    const last = leases.at(-1);
    if (last === undefined) store.remove(leasesKey);
    else store.write(leasesKey, JSON.stringify(leases), last + 1000);
  }
  store.remove(receiptKey);
  return index >= 0;
}
