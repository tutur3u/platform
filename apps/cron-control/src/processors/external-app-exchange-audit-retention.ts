import { withinDeadline } from './deadline';
import {
  MAINTENANCE_BATCH_SIZE,
  type PrivateRpcResult,
  postPrivateRpc,
} from './maintenance-rpc';
import type { ProcessorContext, ProcessorResult } from './types';

// Deletes external-app exchange audit rows older than 180 days (the cutoff is
// the database clock). One slot makes at most EXCHANGE_AUDIT_MAX_PAGES calls
// of MAINTENANCE_BATCH_SIZE rows, checks the job fence before each call and
// stops on the first short page. There is no in-slot retry: an ambiguous
// delete is never replayed immediately.

export const EXCHANGE_AUDIT_PURGE_RPC = 'purge_external_app_exchange_events';
export const EXCHANGE_AUDIT_MAX_PAGES = 8;
export const EXCHANGE_AUDIT_RPC_MISSING =
  'EXTERNAL_APP_EXCHANGE_AUDIT_RPC_MISSING';
/**
 * Until this time, PostgREST's "function not found" (404 `PGRST202`) means
 * the purge function's migration has not applied yet: the slot stops
 * without charging the failure budget. Afterwards every 404 is a failure.
 */
export const RPC_MISSING_GRACE_UNTIL = Date.parse('2026-12-07T23:59:00+07:00');
// Another full page starts only while one call's whole timeout, plus time to
// record the slot's outcome, still fits before the deadline.
export const PAGE_TIME_RESERVE_MS = 40_000;

export interface ExchangeAuditRetentionDeps {
  call: (
    rpc: string,
    body: Record<string, unknown>
  ) => Promise<PrivateRpcResult>;
  canStartAnotherPage: () => boolean;
  /** False once Cron Control stopped the job or its generation changed. */
  fence: () => Promise<boolean>;
  now: () => number;
}

export async function runExchangeAuditRetention(
  deps: ExchangeAuditRetentionDeps
): Promise<ProcessorResult> {
  let deleted = 0;
  for (let page = 0; page < EXCHANGE_AUDIT_MAX_PAGES; page++) {
    if (!(await deps.fence()))
      return { detail: { deleted }, outcome: 'stopped' };

    let result: PrivateRpcResult;
    try {
      result = await deps.call(EXCHANGE_AUDIT_PURGE_RPC, {
        p_limit: MAINTENANCE_BATCH_SIZE,
      });
    } catch {
      return { detail: { deleted }, outcome: 'unknown' };
    }
    if (result.kind === 'http') {
      if (
        result.status === 404 &&
        result.code === 'PGRST202' &&
        deps.now() < RPC_MISSING_GRACE_UNTIL
      ) {
        console.warn(EXCHANGE_AUDIT_RPC_MISSING);
        return { detail: { deleted, rpcMissing: 1 }, outcome: 'stopped' };
      }
      // A 5xx may have deleted rows before failing, so its outcome is unknown.
      return {
        detail: { deleted },
        outcome: result.status < 500 ? 'failed' : 'unknown',
      };
    }
    const removed = result.kind === 'ok' ? result.value : null;
    if (
      typeof removed !== 'number' ||
      !Number.isInteger(removed) ||
      removed < 0 ||
      removed > MAINTENANCE_BATCH_SIZE
    )
      return { detail: { deleted }, outcome: 'unknown' };
    deleted += removed;
    if (removed < MAINTENANCE_BATCH_SIZE)
      return { detail: { deleted }, outcome: 'ok' };
    if (!deps.canStartAnotherPage()) break;
  }
  // Every page was full, or time ran short: the backlog waits for the next
  // daily slot.
  return { detail: { deleted, capped: 1 }, outcome: 'degraded' };
}

/** Cron Control adapter. The service key calls the private function. */
export function purgeExternalAppExchangeAudit(
  context: ProcessorContext
): Promise<ProcessorResult> {
  return runExchangeAuditRetention({
    call: (rpc, body) =>
      postPrivateRpc(context, rpc, body, undefined, { readErrorCode: true }),
    canStartAnotherPage: () =>
      context.now() < context.deadline - PAGE_TIME_RESERVE_MS,
    fence: () => withinDeadline(context, context.fence),
    now: context.now,
  });
}
