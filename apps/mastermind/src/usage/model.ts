import {
  FLEET_USAGE_ACCOUNT_STALE_MS,
  FLEET_USAGE_STALE_MS,
  type FleetUsageSnapshot,
} from '../../../web/src/lib/mastermind/fleet/usage-contract';

type Machine = FleetUsageSnapshot['machines'][number];
type Account = Machine['accounts'][number];
type Bucket = Machine['buckets'][number];
export type UnreadReason = NonNullable<
  Extract<Machine['quota'], { kind: 'unavailable' }>['reason']
>;

export const USAGE_WINDOW_KINDS = ['session', 'weekly', 'monthly'] as const;

function olderThan(at: string | null | undefined, now: number, ms: number) {
  return at != null && now - Date.parse(at) > ms;
}

export function accountStale(account: Account, now: number) {
  return olderThan(account.checkedAt, now, FLEET_USAGE_ACCOUNT_STALE_MS);
}

/** Window rows to draw: session and weekly always, monthly when reported. */
export function windowKinds(account: Account) {
  return USAGE_WINDOW_KINDS.filter(
    (kind) =>
      kind !== 'monthly' || account.windows.some((row) => row.kind === kind)
  );
}

/** Statuses that show an account cannot run, not merely that it is unread. */
const BLOCKED_UNKNOWN = new Set(['not_authenticated', 'disabled']);

/**
 * The account was checked recently, is limited, signed out or disabled, and
 * no window it reports has reached its reset, so the block still holds.
 */
function confirmedUnavailable(account: Account, now: number) {
  const status = account.status;
  return (
    account.checkedAt !== null &&
    !accountStale(account, now) &&
    (status.kind === 'limited' ||
      (status.kind === 'unknown' && BLOCKED_UNKNOWN.has(status.reason))) &&
    account.windows.every(
      (window) => window.resetsAt === null || Date.parse(window.resetsAt) > now
    )
  );
}

export type Readiness =
  | { kind: 'available'; instances: string[] }
  | { kind: 'unread'; reason: UnreadReason | null }
  | { kind: 'none_available' }
  | { kind: 'unconfirmed' };

/**
 * What the readiness line says for one machine, and why when it is empty.
 * `accounts` may be narrowed by a provider filter; whether no account can run
 * is judged on every account the machine reports.
 */
export function readiness(
  machine: Machine,
  accounts: Account[],
  now: number
): Readiness {
  const quota = machine.quota;
  if (quota.kind === 'unavailable') {
    // The contract admits only the publisher's closed reasons.
    return { kind: 'unread', reason: quota.reason ?? null };
  }
  const current = !olderThan(quota.observedAt, now, FLEET_USAGE_STALE_MS);
  const instances = current
    ? accounts
        .filter(
          (account) =>
            account.checkedAt &&
            !accountStale(account, now) &&
            account.status.kind === 'available'
        )
        .map((account) => account.instance)
    : [];
  if (instances.length) return { kind: 'available', instances };
  // Only a complete, current reading whose every account is freshly
  // confirmed unable to run may say that none can.
  if (
    current &&
    quota.kind === 'complete' &&
    machine.accounts.length &&
    machine.accounts.every((account) => confirmedUnavailable(account, now))
  ) {
    return { kind: 'none_available' };
  }
  return { kind: 'unconfirmed' };
}

export type AccountingGaps = {
  unread: string[];
  partial: string[];
  stale: string[];
  unpriced: number;
};

/** Names each machine and price gap behind partial cost totals. */
export function accountingGaps(
  machines: readonly Machine[],
  rows: readonly Bucket[],
  now: number
): AccountingGaps {
  const labels = (test: (machine: Machine) => boolean) =>
    machines.filter(test).map((machine) => machine.label);
  return {
    unread: labels(({ accounting }) => accounting.kind === 'unavailable'),
    partial: labels(({ accounting }) => accounting.kind === 'partial'),
    stale: labels(
      ({ accounting }) =>
        accounting.kind !== 'unavailable' &&
        olderThan(accounting.observedAt, now, FLEET_USAGE_STALE_MS)
    ),
    unpriced: rows.reduce(
      (total, row) =>
        total +
        (row.unpricedRecords > 0
          ? row.unpricedRecords
          : row.costUsd === null
            ? 1
            : 0),
      0
    ),
  };
}

export function hasAccountingGaps(gaps: AccountingGaps) {
  return (
    gaps.unread.length > 0 ||
    gaps.partial.length > 0 ||
    gaps.stale.length > 0 ||
    gaps.unpriced > 0
  );
}
