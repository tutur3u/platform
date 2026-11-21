import { withinDeadline } from './deadline';
import { type PrivateRpcResult, postPrivateRpc } from './maintenance-rpc';
import {
  CostBudgetError,
  type CostLine,
  CostSourceError,
  type CostSource,
  type CostSourceEnv,
  configuredCostSources,
} from './provider-cost-sources';
import type { ProcessorContext, ProcessorResult } from './types';

// Each run collects at most this many provider-days per source: the two most
// recent completed days (providers restate them while usage settles) and the
// oldest uncollected day inside the backfill window.
export const MAX_DAYS_PER_SOURCE = 3;
export const RESTATED_DAYS = 2;
export const BACKFILL_DAYS = 90;
export const PROVIDER_TIMEOUT_MS = 45_000;
const MIN_REQUEST_MS = 1_000;

function utcDay(epochMs: number, offsetDays: number) {
  const date = new Date(epochMs);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function providerSignal(context: ProcessorContext, timeoutMs: number) {
  const remaining = context.deadline - context.now();
  if (remaining < MIN_REQUEST_MS) return null;
  const timeout = AbortSignal.timeout(Math.min(timeoutMs, remaining));
  return context.signal ? AbortSignal.any([context.signal, timeout]) : timeout;
}

export async function planCollectionDays(
  context: ProcessorContext,
  source: CostSource
): Promise<string[]> {
  const now = context.now();
  const recent = Array.from({ length: RESTATED_DAYS }, (_, index) =>
    utcDay(now, -1 - index)
  );
  const result = await postPrivateRpc(
    context,
    'plan_provider_cost_days',
    {
      p_account_id: source.accountId,
      p_backfill_limit: MAX_DAYS_PER_SOURCE - RESTATED_DAYS,
      p_from: utcDay(now, -BACKFILL_DAYS),
      p_provider: source.provider,
      p_recent: recent,
      p_to: utcDay(now, -1),
    },
    4_096
  );
  if (result.kind !== 'ok' || !Array.isArray(result.value))
    throw new Error('Cost day planning failed');
  return result.value
    .filter(
      (value): value is string =>
        typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)
    )
    .slice(0, MAX_DAYS_PER_SOURCE);
}

function dayRpcBody(source: CostSource, day: string) {
  return {
    p_account_id: source.accountId,
    p_provider: source.provider,
    p_usage_date: day,
  };
}

async function markExhausted(
  context: ProcessorContext,
  source: CostSource,
  day: string
) {
  const result = await postPrivateRpc(
    context,
    'mark_provider_cost_day_exhausted',
    dayRpcBody(source, day)
  );
  return result.kind === 'ok' && result.value === true;
}

// The whole run is over: the job deadline passed or the run was aborted.
// A provider request that timed out on its own budget is a day failure.
function runEnded(context: ProcessorContext) {
  return (
    context.signal?.aborted === true ||
    (context as { expired?: boolean }).expired === true ||
    context.deadline - context.now() < MIN_REQUEST_MS
  );
}

function isTimeout(context: ProcessorContext, error: unknown) {
  const name = error instanceof Error ? error.name : '';
  return (
    context.signal?.aborted === true ||
    name === 'TimeoutError' ||
    name === 'AbortError'
  );
}

// Allowlisted log fields: provider errors never carry response content.
function failureFields(error: unknown, signal: AbortSignal) {
  if (signal.aborted) return { category: 'timeout' };
  if (error instanceof CostSourceError)
    return { category: error.category, status: error.status };
  return { category: 'read' };
}

export async function collectProviderCosts(
  context: ProcessorContext,
  sources: CostSource[] = configuredCostSources(
    context.env as unknown as CostSourceEnv
  ),
  {
    providerTimeoutMs = PROVIDER_TIMEOUT_MS,
  }: { providerTimeoutMs?: number } = {}
): Promise<ProcessorResult> {
  const detail = {
    days: 0,
    exhausted_days: 0,
    failed_days: 0,
    lines: 0,
    sources: sources.length,
  };
  if (sources.length === 0) return { detail, outcome: 'ok' };

  sources: for (const source of sources) {
    if (!(await withinDeadline(context, context.fence)))
      return { detail, outcome: 'stopped' };
    let days: string[];
    try {
      days = await planCollectionDays(context, source);
    } catch (error) {
      if (isTimeout(context, error)) return { detail, outcome: 'unknown' };
      console.error('Provider cost planning failed', {
        provider: source.provider,
      });
      detail.failed_days += 1;
      continue;
    }
    for (const day of days) {
      if (!(await withinDeadline(context, context.fence)))
        return { detail, outcome: 'stopped' };
      const signal = providerSignal(context, providerTimeoutMs);
      if (!signal) return { detail, outcome: 'unknown' };

      // Claim: a rejected claim fails the day; an unconfirmed one ends the
      // run as unknown, since its attempt may or may not have been counted.
      let claim: PrivateRpcResult;
      try {
        claim = await postPrivateRpc(
          context,
          'claim_provider_cost_day',
          dayRpcBody(source, day)
        );
      } catch {
        return { detail, outcome: 'unknown' };
      }
      if (claim.kind === 'http') {
        console.error('Provider cost day claim rejected', {
          day,
          provider: source.provider,
          status: claim.status,
        });
        detail.failed_days += 1;
        continue;
      }
      if (claim.kind !== 'ok' || typeof claim.value !== 'boolean')
        return { detail, outcome: 'unknown' };
      if (!claim.value) {
        detail.exhausted_days += 1;
        continue;
      }
      // A stop or resume can land while the claim is in flight; the old
      // generation must not reach the provider after it.
      if (!(await withinDeadline(context, context.fence)))
        return { detail, outcome: 'stopped' };

      // Provider read. Its errors never involve a database write.
      const collectedAt = new Date(context.now()).toISOString();
      let lines: CostLine[];
      try {
        lines = await withinDeadline(context, () =>
          source.read({
            day,
            fetch: context.fetch,
            signal,
            userAgent: context.userAgent,
          })
        );
      } catch (error) {
        if (runEnded(context)) return { detail, outcome: 'unknown' };
        if (error instanceof CostBudgetError) {
          // Terminal: later runs skip this day instead of paying again. If
          // the marker is not confirmed, the claimed attempt still counts.
          const marked = await withinDeadline(context, () =>
            markExhausted(context, source, day)
          ).catch(() => false);
          if (marked) detail.exhausted_days += 1;
          else detail.failed_days += 1;
          console.warn('Provider cost day exceeded its budget', {
            day,
            marked,
            provider: source.provider,
          });
          continue;
        }
        detail.failed_days += 1;
        console.error('Provider cost day failed', {
          day,
          provider: source.provider,
          ...failureFields(error, signal),
        });
        // A provider that timed out is skipped for the rest of this run so
        // it cannot starve the next source of the run deadline.
        if (signal.aborted) continue sources;
        continue;
      }

      // Write: a rejected write fails the day; an unconfirmed one may have
      // committed, so the run outcome is unknown.
      let write: PrivateRpcResult;
      try {
        write = await postPrivateRpc(context, 'record_provider_cost_day', {
          ...dayRpcBody(source, day),
          p_collected_at: collectedAt,
          p_lines: lines,
        });
      } catch {
        return { detail, outcome: 'unknown' };
      }
      if (write.kind === 'http') {
        console.error('Provider cost day write rejected', {
          day,
          provider: source.provider,
          status: write.status,
        });
        detail.failed_days += 1;
        continue;
      }
      if (write.kind !== 'ok' || typeof write.value !== 'number')
        return { detail, outcome: 'unknown' };
      detail.days += 1;
      detail.lines += write.value;
    }
  }
  if (detail.failed_days === 0 && detail.exhausted_days === 0)
    return { detail, outcome: 'ok' };
  // Exhausted days are recorded terminal states, so they degrade the run
  // for operators without counting as an unrecorded failure. A failed day
  // keeps its claimed attempt, so repeated failures exhaust it durably.
  return {
    detail,
    outcome:
      detail.days > 0 || detail.exhausted_days > 0 ? 'degraded' : 'failed',
  };
}
