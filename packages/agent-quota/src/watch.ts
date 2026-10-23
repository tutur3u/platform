import { accountKey, collapseAccounts } from './accounts';
import { matchingBlocks } from './block-ledger';
import { collectAll } from './collectors';
import { readLedger } from './hook-ledger';
import { RESERVATION_TTL } from './ledger-retention';
import { recommend } from './policy';
import type { PoolSettings } from './pool-settings';
import { chooseRoleCandidate } from './role-policy';
import type { RankedInstance, UsageWindow } from './types';

export type WatchVerdict = 'ok' | 'warn' | 'switch-now';
export interface WatchOptions {
  warnPercent?: number;
  criticalPercent?: number;
  hysteresisPercent?: number;
  previous?: WatchVerdict;
  role?: 'main' | 'child';
  allowNonClaudeFallback?: boolean;
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
  ttlMs: number
): number | undefined {
  const scoped = windows.filter(
    (window) => window.kind === 'short' || window.kind === 'session'
  );
  if (!scoped.length) return;
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
      Number.isFinite(reset) &&
      reset > now.getTime()
    );
  };
  if (scoped.some((window) => !isFresh(window))) return;
  const values = scoped.map((window) => window.usedPercent!);
  return values.length ? 100 - Math.max(...values) : undefined;
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
  allowNonClaudeFallback = false
): string | undefined {
  const eligible = ranking.filter((rank) => {
    if (
      !rank.eligible ||
      rank.state !== 'healthy' ||
      rank.activeCount !== 0 ||
      rank.instanceIds.some((id) => ownerIds.includes(id)) ||
      matchingBlocks(blocks, rank.instanceIds, undefined, now).length ||
      rank.instanceIds.some((id) => reservedInstanceIds.includes(id))
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
      const account = collapseAccounts(accounts).find((candidate) =>
        rank.instanceIds.includes(candidate.instanceId)
      );
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
  const accounts = collapseAccounts(data.accounts);
  const ownerAccount = accounts.find((account) =>
    (account.instanceIds ?? [account.instanceId]).includes(owner)
  );
  if (!ownerAccount) throw new Error('watch-owner-unverified');

  const remaining = freshRemainingPercent(
    ownerAccount.windows,
    now,
    (ownerAccount.provider === 'antigravity' ? 5 : 15) * 60_000
  );
  const verdict = watchVerdict(remaining, options);
  let successor: string | undefined;
  if (verdict !== 'ok') {
    const ledger = await readLedger();
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
      active: data.active,
      blocks: data.blocks,
      task: { kind: 'implementation' },
      now,
      reserves,
    }).ranked;
    const ownerIds = ownerAccount.instanceIds ?? [ownerAccount.instanceId];
    const nativeReservations = data.active.flatMap(
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
      options.allowNonClaudeFallback ?? false
    );
  }
  return {
    verdict,
    owner,
    state: remaining === undefined ? 'UNKNOWN' : 'FRESH',
    remainingPercent: remaining === undefined ? null : Math.round(remaining),
    successor: successor ?? null,
    successorReason:
      options.role === 'main' && !successor
        ? 'main-role-no-eligible-claude'
        : options.role === 'main' && successor
          ? collapseAccounts(data.accounts).find(
              (candidate) => candidate.instanceId === successor
            )?.provider === 'claude'
            ? 'healthy-claude-preferred'
            : 'explicit-non-claude-fallback'
          : undefined,
  };
}
