import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { accountKey, collapseAccounts } from './accounts';
import {
  type BlockLedger,
  matchingBlocks,
  readBlockLedger,
} from './block-ledger';
import { capacityCooldownActive } from './capacity';
import { collectAll } from './collectors';
import { collectPoolReceipts } from './collectors/children';
import { usageLimitReceiptActive } from './failure-receipt';
import { applyFutureQuarantines } from './future-quarantine';
import { HookError, transactLedger } from './hook-ledger';
import type { AdmissionContext, HookLedger } from './hooks-types';
import { pruneLedger } from './ledger-retention';
import { recommend } from './policy';
import { poolPolicyReasons } from './pool-settings';
import { clearRecoveredLimits } from './receipt-expiry';
import type { ChildSnapshot } from './reconcile-children';
import { applyDescendantReceipts } from './recovery';
import { coversModel, receiptCovers } from './window-scope';

type LedgerTransaction = <T>(
  operation: (ledger: HookLedger) => T | Promise<T>
) => Promise<T>;
const PROVISIONAL_RESERVATION_TTL_MS = 5 * 60_000;

export function recordPositionalAdmission(
  ledger: HookLedger,
  pool: string,
  model: string,
  account: ReturnType<typeof collapseAccounts>[number],
  now: Date
) {
  ledger.lastAdmissions ??= {};
  ledger.lastAdmissions[pool] = now.getTime();
  const requestedThreadId =
    process.env.T3_CURRENT_THREAD_ID ?? process.env.T3_THREAD_ID;
  const threadId =
    requestedThreadId && /^[A-Za-z0-9_-]{1,256}$/.test(requestedThreadId)
      ? requestedThreadId
      : 'positional-admit';
  ledger.reservations.push({
    requestId: `positional:${randomUUID()}`,
    threadId,
    instanceId: pool,
    accountKey: accountKey(account),
    model,
    createdAt: now.toISOString(),
    expiresAt: new Date(
      now.getTime() + PROVISIONAL_RESERVATION_TTL_MS
    ).toISOString(),
  });
}

export interface PositionalAdmitDependencies {
  readBlockLedger: () => Promise<BlockLedger>;
  collectAll: typeof collectAll;
  collectPoolReceipts: (instanceIds: string[], now: Date) => ChildSnapshot;
  transactLedger: LedgerTransaction;
  now: () => Date;
}

const DEFAULT_DEPENDENCIES: PositionalAdmitDependencies = {
  readBlockLedger,
  collectAll,
  collectPoolReceipts,
  transactLedger,
  now: () => new Date(),
};
export function gateDecision(
  pool: string,
  model: string,
  context: AdmissionContext,
  reserveOwner = false,
  reservePercent = 30,
  unknownMaxConcurrent = 1
) {
  const account = collapseAccounts(context.accounts).find((item) =>
    (item.instanceIds ?? [item.instanceId]).includes(pool)
  );
  const ids = account?.instanceIds ?? [pool];
  const blocks = matchingBlocks(context.blocks ?? [], ids, model, context.now);
  if (blocks.length)
    return {
      status: 'BLOCKED',
      exitCode: 3,
      reasons: ['observed-block-ledger'],
    };
  if (!account)
    return { status: 'BLOCKED', exitCode: 2, reasons: ['pool-unverified'] };
  const member = context.accounts.find((item) => item.instanceId === pool);
  if (member?.available !== true || !member.models?.includes(model))
    return {
      status: 'BLOCKED',
      exitCode: 2,
      reasons: ['model-unavailable-or-unverified'],
    };
  const ledger = context.ledger;
  pruneLedger(
    ledger,
    context.now,
    context.active.flatMap((item) => item.reservationIds ?? [])
  );
  applyFutureQuarantines(context);
  const nativeIds = context.active.flatMap((item) => item.reservationIds ?? []);
  const reserved = ledger.reservations.filter(
    (item) =>
      ids.includes(item.instanceId) &&
      (!item.nativeReservationId ||
        !nativeIds.includes(item.nativeReservationId))
  ).length;
  const active = context.active.map((item) => ({ ...item }));
  active.push({ instanceId: pool, count: reserved });
  // recommend accounts for native active loads; aggregate duplicate instances first.
  const loads = [...new Set(active.map((item) => item.instanceId))].map(
    (instanceId) => ({
      instanceId,
      count: active
        .filter((item) => item.instanceId === instanceId)
        .reduce((sum, item) => sum + item.count, 0),
    })
  );
  const rank = recommend({
    accounts: context.accounts.filter((item) => ids.includes(item.instanceId)),
    active: loads,
    task: { model },
    now: context.now,
    blocks: context.blocks,
  }).ranked[0];
  if (!rank)
    return { status: 'BLOCKED', exitCode: 2, reasons: ['pool-unverified'] };
  const reasons: string[] = poolPolicyReasons(
    account,
    model,
    rank.activeCount,
    context
  );
  if (context.ledger.futureQuarantines?.[accountKey(account)])
    reasons.push('future-receipt-untrusted');
  clearRecoveredLimits({ ...context, ledger });
  if (
    ledger.observations.some(
      (event) =>
        ids.includes(event.instanceId) &&
        event.outcome === 'usage-limit' &&
        !event.clearedAt &&
        usageLimitReceiptActive(event, context.now) &&
        receiptCovers(event, account.provider, model)
    )
  )
    reasons.push('observed-usage-limit');
  if (
    ledger.observations.some(
      (event) =>
        ids.includes(event.instanceId) &&
        capacityCooldownActive(event, model, context.now)
    )
  )
    reasons.push('capacity-cooldown');
  if (
    rank.state === 'exhausted' ||
    rank.state === 'near' ||
    rank.reasons.some((reason) => reason.code === 'near-limit-stale')
  )
    reasons.push('pool-near-or-exhausted');
  if (
    rank.reasons.some((reason) =>
      [
        'reserve',
        'reserved-excluded',
        'concurrency-reserve',
        'reserve-unknown',
      ].includes(reason.code)
    )
  )
    reasons.push('pool-reserve');
  if (rank.state === 'UNKNOWN' && rank.activeCount >= unknownMaxConcurrent)
    reasons.push('unknown-reservation-cap');
  if (reserveOwner) {
    const windows = account.windows.filter((window) =>
      coversModel(window, model)
    );
    if (
      rank.state !== 'healthy' ||
      !windows.length ||
      Math.min(...windows.map((window) => 100 - (window.usedPercent ?? 100))) <=
        reservePercent
    )
      reasons.push('orchestrator-reserve');
  }
  return {
    status: reasons.length ? 'BLOCKED' : 'ADMIT',
    exitCode: reasons.length ? 3 : 0,
    reasons: reasons.length
      ? reasons
      : [
          rank.state === 'UNKNOWN'
            ? 'bounded-unknown-admission'
            : 'fresh-headroom',
        ],
    state: rank.state,
    activeReservations: rank.activeCount,
  };
}
export function parseCatalogStdin(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new HookError('catalog-stdin-invalid');
  }
}
export async function runPositionalAdmit(
  args: string[],
  readCatalogInput: () => string = () => readFileSync(0, 'utf8'),
  overrides: Partial<PositionalAdmitDependencies> = {}
) {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  try {
    const [pool, model] = args;
    if (
      args
        .slice(2)
        .some((arg) => !['--reserve-owner', '--catalog-stdin'].includes(arg)) ||
      args.length > 4 ||
      (args.length >= 2 && new Set(args.slice(2)).size !== args.length - 2)
    )
      throw new HookError('admit-options-invalid');
    if (
      !pool ||
      !model ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(pool) ||
      !/^[A-Za-z0-9_./:%-]{1,256}$/.test(model)
    )
      throw new HookError('admit-pool-model-invalid');
    const now = dependencies.now();
    const { blocks } = await dependencies.readBlockLedger();
    // Hard deny before even reading the catalog or snapshots.
    if (matchingBlocks(blocks, [pool], model, now).length) {
      console.log(
        JSON.stringify({
          status: 'BLOCKED',
          pool,
          model,
          reasons: ['observed-block-ledger'],
        })
      );
      process.exitCode = 3;
      return;
    }
    let catalog: unknown;
    if (args.includes('--catalog-stdin')) {
      catalog = parseCatalogStdin(readCatalogInput());
    }
    const collected = await dependencies.collectAll({
      snapshotsOnly: true,
      catalog,
    });
    if (!collected.t3ObservedAt || collected.active === undefined)
      throw new HookError('reservation-state-unavailable');
    const active = collected.active;
    const owner = process.env.AGENT_QUOTA_OWNER_POOL;
    if (
      owner &&
      !collected.accounts.some((account) => account.instanceId === owner)
    )
      throw new HookError('owner-pool-unverified');
    const account = collapseAccounts(collected.accounts).find((item) =>
      (item.instanceIds ?? [item.instanceId]).includes(pool)
    );
    const poolReceipts = dependencies.collectPoolReceipts(
      collected.accounts.map((account) => account.instanceId),
      now
    );
    const reserveOwner =
      args.includes('--reserve-owner') ||
      Boolean(owner && (account?.instanceIds ?? [pool]).includes(owner));
    const result = await dependencies.transactLedger((ledger) => {
      const transactionNow = dependencies.now();
      const context = {
        ...collected,
        active,
        blocks: collected.blocks ?? blocks,
        ledger,
        now: transactionNow,
      };
      applyDescendantReceipts(
        poolReceipts,
        context,
        Intl.DateTimeFormat().resolvedOptions().timeZone
      );
      const result = gateDecision(pool, model, context, reserveOwner);
      if (result.exitCode === 0) {
        if (!account) throw new HookError('pool-unverified');
        recordPositionalAdmission(ledger, pool, model, account, context.now);
      }
      return result;
    });
    console.log(
      JSON.stringify({
        pool,
        model,
        ...result,
        invalidObservations: collected.invalidObservations ?? [],
      })
    );
    process.exitCode = result.exitCode;
  } catch (error) {
    console.log(
      JSON.stringify({
        status: 'BLOCKED',
        reasons: [
          error instanceof HookError
            ? error.message
            : 'admission-state-unavailable',
        ],
        retryable:
          error instanceof HookError &&
          error.message === 'ledger-contention-retry',
      })
    );
    process.exitCode =
      error instanceof HookError && error.message === 'ledger-contention-retry'
        ? 3
        : 2;
  }
}
