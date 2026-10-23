import { accountKey, collapseAccounts } from './accounts';
import { matchingBlocks, type QuotaBlock } from './block-ledger';
import { capacityCooldownActive } from './capacity';
import { collectAll } from './collectors';
import { usageLimitReceiptActive } from './failure-receipt';
import { readLedger } from './hook-ledger';
import type { Observation } from './hooks-types';
import { RESERVATION_TTL } from './ledger-retention';
import { recommend, SIGNAL_TTL_MS } from './policy';
import type { PoolSettings } from './pool-settings';
import { chooseRoleCandidate } from './role-policy';
import type { AccountUsage, RankedInstance, UsageWindow } from './types';
import { coversModel, noResetWindowMaxAgeMs } from './window-scope';

export type WatchVerdict = 'ok' | 'warn' | 'switch-now';
export interface WatchOptions {
  warnPercent?: number;
  criticalPercent?: number;
  hysteresisPercent?: number;
  previous?: WatchVerdict;
  role?: 'main' | 'child';
  allowNonClaudeFallback?: boolean;
  model?: string;
  now?: Date;
}

export function watchVerdict(
  remaining: number | undefined,
  options: WatchOptions = {}
): WatchVerdict {
  const warn = options.warnPercent ?? 25;
  const critical = options.criticalPercent ?? 12;
  const hysteresis = options.hysteresisPercent ?? 3;
  if (
    !Number.isFinite(warn) ||
    !Number.isFinite(critical) ||
    !Number.isFinite(hysteresis) ||
    critical < 0 ||
    warn < 0 ||
    warn > 100 ||
    critical > 100 ||
    critical >= warn ||
    hysteresis < 0 ||
    warn + hysteresis > 100
  )
    throw new Error('watch-thresholds-invalid');
  if (remaining === undefined || !Number.isFinite(remaining)) return 'warn';
  const previous = options.previous;
  if (previous === 'switch-now') {
    if (remaining <= critical + hysteresis) return 'switch-now';
    return remaining <= warn ? 'warn' : 'ok';
  }
  if (remaining <= critical) return 'switch-now';
  if (previous === 'warn' && remaining <= warn + hysteresis) return 'warn';
  if (remaining <= warn) return 'warn';
  return 'ok';
}

export function freshRemainingPercent(
  windows: UsageWindow[],
  now: Date,
  ttlMs: number,
  model?: string
): number | undefined {
  if (
    windows.some(
      (window) =>
        window.authoritative &&
        window.scope?.kind === 'unknown' &&
        (!model || !coversModel(window, model))
    )
  )
    return undefined;
  const scoped = windows.filter(
    (window) => (!model || coversModel(window, model)) && window.authoritative
  );
  if (!scoped.length) return undefined;
  const isFresh = (window: UsageWindow) => {
    const observed = Date.parse(window.observedAt);
    const reset = Date.parse(window.resetsAt ?? '');
    return (
      window.authoritative &&
      typeof window.usedPercent === 'number' &&
      Number.isFinite(window.usedPercent) &&
      window.usedPercent >= 0 &&
      window.usedPercent <= 100 &&
      Number.isFinite(observed) &&
      observed <= now.getTime() + 5 * 60_000 &&
      now.getTime() - observed <= ttlMs &&
      Boolean(window.resetsAt) &&
      Number.isFinite(reset) &&
      reset > now.getTime()
    );
  };
  if (scoped.some((window) => !isFresh(window))) return;
  const values = scoped.map((window) => window.usedPercent!);
  return values.length ? 100 - Math.max(...values) : undefined;
}

export function ownerFenceReason(
  account: AccountUsage,
  blocks: QuotaBlock[],
  observations: Observation[],
  now: Date,
  model?: string
): string | undefined {
  const ids = account.instanceIds ?? [account.instanceId];
  if (matchingBlocks(blocks, ids, model, now).length) return 'active-block';
  if (
    observations.some((event) => {
      if (
        !ids.includes(event.instanceId) &&
        event.accountKey !== accountKey(account)
      )
        return false;
      if (event.clearedAt) return false;
      return event.outcome === 'usage-limit'
        ? usageLimitReceiptActive(event, now) &&
            (!model ||
              event.windowScope?.kind !== 'models' ||
              coversModel({ scope: event.windowScope } as UsageWindow, model))
        : capacityCooldownActive(event, model ?? event.model, now);
    })
  )
    return 'active-ledger-receipt';
  return undefined;
}

export function ownerWatchStatus(
  account: AccountUsage,
  blocks: QuotaBlock[],
  observations: Observation[],
  now: Date,
  options: WatchOptions = {}
) {
  const remaining = freshRemainingPercent(
    account.windows,
    now,
    SIGNAL_TTL_MS[account.provider],
    options.model
  );
  const fence = ownerFenceReason(
    account,
    blocks,
    observations,
    now,
    options.model
  );
  const knownExhaustion = account.windows.some((window) => {
    if (
      !window.authoritative ||
      window.usedPercent !== 100 ||
      (options.model && !coversModel(window, options.model))
    )
      return false;
    if (window.resetsAt) {
      const reset = Date.parse(window.resetsAt);
      return Number.isFinite(reset) && reset > now.getTime();
    }
    const observed = Date.parse(window.observedAt);
    return (
      Number.isFinite(observed) &&
      now.getTime() - observed <= noResetWindowMaxAgeMs(window)
    );
  });
  const reason =
    fence ?? (knownExhaustion ? 'reported-limit-not-reset' : undefined);
  return {
    remaining,
    reason,
    verdict: reason
      ? ('switch-now' as const)
      : watchVerdict(remaining, options),
  };
}

export function watchSuccessorReason(
  verdict: WatchVerdict,
  role: 'main' | 'child' | undefined,
  successor: string | undefined,
  accounts: AccountUsage[]
) {
  if (verdict === 'ok' || role !== 'main') return undefined;
  if (!successor) return 'main-role-no-eligible-claude';
  return collapseAccounts(accounts).find(
    (candidate) =>
      candidate.instanceId === successor ||
      (candidate.instanceIds ?? []).includes(successor)
  )?.provider === 'claude'
    ? 'healthy-claude-preferred'
    : 'explicit-non-claude-fallback';
}

function hasActiveLedgerFence(
  ids: string[],
  identity: string | undefined,
  observations: Observation[],
  now: Date
) {
  return observations.some(
    (event) =>
      !event.clearedAt &&
      (ids.includes(event.instanceId) ||
        Boolean(identity && event.accountKey === identity)) &&
      (event.outcome === 'usage-limit'
        ? usageLimitReceiptActive(event, now)
        : capacityCooldownActive(event, event.model, now))
  );
}

export function selectSuccessor(
  ownerIds: string[],
  ranking: RankedInstance[],
  blocks: Awaited<ReturnType<typeof collectAll>>['blocks'],
  reservedInstanceIds: string[],
  now: Date,
  poolSettings: Record<string, PoolSettings> = {},
  lastAdmissions: Record<string, number> = {},
  accounts: Awaited<ReturnType<typeof collectAll>>['accounts'] = [],
  poolHolds: Record<string, boolean> = {},
  role: 'main' | 'child' = 'child',
  allowNonClaudeFallback = false,
  observations: Observation[] = []
): string | undefined {
  const eligible = ranking.filter((rank) => {
    const account = collapseAccounts(accounts).find((candidate) =>
      rank.instanceIds.some((id) =>
        (candidate.instanceIds ?? [candidate.instanceId]).includes(id)
      )
    );
    if (
      !rank.eligible ||
      rank.state !== 'healthy' ||
      rank.activeCount !== 0 ||
      rank.instanceIds.some((id) => ownerIds.includes(id)) ||
      matchingBlocks(blocks, rank.instanceIds, undefined, now).length ||
      rank.instanceIds.some((id) => reservedInstanceIds.includes(id))
    )
      return false;
    if (
      hasActiveLedgerFence(
        rank.instanceIds,
        account ? accountKey(account) : undefined,
        observations,
        now
      )
    )
      return false;
    const settings = rank.instanceIds.flatMap((id) =>
      poolSettings[id] ? [poolSettings[id]!] : []
    );
    if (settings.length) {
      const pacingMs = Math.max(...settings.map((item) => item.pacingMs));
      const nearUsedPercent = Math.min(
        ...settings.map((item) => item.nearUsedPercent)
      );
      const hysteresisPercent = Math.max(
        ...settings.map((item) => item.hysteresisPercent)
      );
      if (
        rank.instanceIds.some(
          (id) => now.getTime() - (lastAdmissions[id] ?? 0) < pacingMs
        )
      )
        return false;
      if (!account) return false;
      const used = account.windows
        .filter(
          (window) =>
            window.authoritative &&
            typeof window.usedPercent === 'number' &&
            Date.parse(window.observedAt) <= now.getTime() &&
            now.getTime() - Date.parse(window.observedAt) <=
              (account.provider === 'antigravity' ? 5 : 15) * 60_000 &&
            Date.parse(window.resetsAt ?? '') > now.getTime()
        )
        .map((window) => window.usedPercent!);
      const held = Boolean(
        Object.entries(poolHolds).some(
          ([key, value]) => value && key.startsWith(`${accountKey(account)}:`)
        )
      );
      if (
        !used?.length ||
        Math.max(...used) >= nearUsedPercent ||
        (held && Math.max(...used) > nearUsedPercent - hysteresisPercent)
      )
        return false;
    }
    return true;
  });
  return chooseRoleCandidate(role, eligible, allowNonClaudeFallback).candidate
    ?.instanceId;
}

export async function evaluateWatch(owner: string, options: WatchOptions = {}) {
  const now = options.now ?? new Date();
  const data = await collectAll({ snapshotsOnly: true });
  if (data.active === undefined) throw new Error('watch-activity-unknown');
  const active = data.active;
  const accounts = collapseAccounts(data.accounts);
  const ownerAccount = accounts.find((account) =>
    (account.instanceIds ?? [account.instanceId]).includes(owner)
  );
  if (!ownerAccount) throw new Error('watch-owner-unverified');

  const ledger = await readLedger();
  const ownerStatus = ownerWatchStatus(
    ownerAccount,
    data.blocks,
    ledger.observations,
    now,
    options
  );
  const { remaining, reason: fenceReason, verdict } = ownerStatus;
  let successor: string | undefined;
  if (verdict !== 'ok') {
    const reserves = Object.fromEntries(
      Object.entries(data.poolSettings).map(([id, settings]) => [
        id,
        {
          minRemainingPercent: settings.reservePercent,
          maxConcurrent: settings.maxConcurrent,
        },
      ])
    );
    const ranking = recommend({
      accounts: data.accounts,
      active,
      blocks: data.blocks,
      task: { kind: 'implementation' },
      now,
      reserves,
    }).ranked;
    const ownerIds = ownerAccount.instanceIds ?? [ownerAccount.instanceId];
    const nativeReservations = active.flatMap(
      (assignment) => assignment.reservationIds ?? []
    );
    const currentReservations = ledger.reservations
      .filter(
        (reservation) =>
          (reservation.nativeReservationId &&
            nativeReservations.includes(reservation.nativeReservationId)) ||
          now.getTime() - Date.parse(reservation.createdAt) <= RESERVATION_TTL
      )
      .map((reservation) => reservation.instanceId);
    successor = selectSuccessor(
      ownerIds,
      ranking,
      data.blocks,
      currentReservations,
      now,
      data.poolSettings,
      ledger.lastAdmissions,
      data.accounts,
      ledger.poolHolds,
      options.role ?? 'child',
      options.allowNonClaudeFallback ?? false,
      ledger.observations
    );
  }
  return {
    verdict,
    owner,
    state: remaining === undefined ? 'UNKNOWN' : 'FRESH',
    remainingPercent: remaining === undefined ? null : Math.round(remaining),
    reason: fenceReason,
    successor: successor ?? null,
    successorReason: watchSuccessorReason(
      verdict,
      options.role,
      successor,
      data.accounts
    ),
  };
}
