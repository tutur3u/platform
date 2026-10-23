import { collapseAccounts } from './accounts';
import { matchingBlocks, readBlockLedger } from './block-ledger';
import { collectAll } from './collectors';
import { collectPoolReceipts } from './collectors/children';
import { HookError, transactLedger } from './hook-ledger';
import type { AdmissionContext } from './hooks-types';
import { pruneLedger } from './ledger-retention';
import { recommend } from './policy';
import { poolPolicyReasons } from './pool-settings';
import { clearRecoveredLimits } from './receipt-expiry';
import { applyDescendantReceipts } from './recovery';
import { coversModel, receiptCovers } from './window-scope';
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
  const ledger = structuredClone(context.ledger);
  pruneLedger(
    ledger,
    context.now,
    context.active.flatMap((item) => item.reservationIds ?? [])
  );
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
  clearRecoveredLimits({ ...context, ledger });
  if (
    ledger.observations.some(
      (event) =>
        ids.includes(event.instanceId) &&
        event.outcome === 'usage-limit' &&
        !event.clearedAt &&
        receiptCovers(event, account.provider, model)
    )
  )
    reasons.push('observed-usage-limit');
  if (
    ledger.observations.some(
      (event) =>
        ids.includes(event.instanceId) &&
        event.outcome === 'capacity-error' &&
        context.now.getTime() - Date.parse(event.observedAt) < 60_000
    )
  )
    reasons.push('capacity-cooldown');
  if (rank.state === 'exhausted' || rank.state === 'near')
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
export async function runPositionalAdmit(args: string[]) {
  try {
    const [pool, model] = args;
    if (
      args.slice(2).some((arg) => arg !== '--reserve-owner') ||
      args.length > 3
    )
      throw new HookError('admit-options-invalid');
    if (
      !pool ||
      !model ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(pool) ||
      !/^[A-Za-z0-9_./:%-]{1,256}$/.test(model)
    )
      throw new HookError('admit-pool-model-invalid');
    const { blocks } = await readBlockLedger();
    // Hard deny before even reading the catalog or snapshots.
    if (matchingBlocks(blocks, [pool], model, new Date()).length) {
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
    const collected = await collectAll({ snapshotsOnly: true });
    if (!collected.t3ObservedAt)
      throw new HookError('reservation-state-unavailable');
    const owner = process.env.AGENT_QUOTA_OWNER_POOL;
    if (
      owner &&
      !collected.accounts.some((account) => account.instanceId === owner)
    )
      throw new HookError('owner-pool-unverified');
    const account = collapseAccounts(collected.accounts).find((item) =>
      (item.instanceIds ?? [item.instanceId]).includes(pool)
    );
    const reserveOwner =
      args.includes('--reserve-owner') ||
      Boolean(owner && (account?.instanceIds ?? [pool]).includes(owner));
    const result = await transactLedger((ledger) => {
      const context = {
        ...collected,
        blocks: collected.blocks ?? blocks,
        ledger,
        now: new Date(),
      };
      applyDescendantReceipts(
        collectPoolReceipts(
          collected.accounts.map((account) => account.instanceId),
          context.now
        ),
        context,
        Intl.DateTimeFormat().resolvedOptions().timeZone
      );
      const result = gateDecision(pool, model, context, reserveOwner);
      if (result.exitCode === 0) {
        ledger.lastAdmissions ??= {};
        ledger.lastAdmissions[pool] = context.now.getTime();
      }
      return result;
    });
    console.log(JSON.stringify({ pool, model, ...result }));
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
      })
    );
    process.exitCode = 2;
  }
}
