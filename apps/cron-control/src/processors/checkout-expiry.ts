import { databaseHeaders } from '../database';
import { MAX_PENDING_WORK } from '../ledger';
import { withinDeadline } from './deadline';
import type { ProcessorContext, ProcessorResult } from './types';

export const EXPIRY_BATCH_SIZE = 1_000;
export const EXPIRY_MAX_BATCHES = 10;
export const REVALIDATION_CHUNK = 100;
export const MIN_REQUEST_MS = 1_000;
export const REVALIDATION_RESERVE_MS = 120_000;
const DATABASE_TIMEOUT_MS = 30_000;
const REVALIDATION_TIMEOUT_MS = 60_000;

function requestTimeout(context: ProcessorContext, cap: number) {
  const remaining = context.deadline - context.now();
  return remaining < MIN_REQUEST_MS ? null : Math.min(cap, remaining);
}

function requestSignal(context: ProcessorContext, timeoutMs: number) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return context.signal ? AbortSignal.any([context.signal, timeout]) : timeout;
}

function outcomeOf(error: unknown): ProcessorResult['outcome'] {
  const name = error instanceof Error ? error.name : '';
  return name === 'TimeoutError' || name === 'AbortError'
    ? 'unknown'
    : 'failed';
}

async function expireBatch(
  context: ProcessorContext,
  now: string,
  timeoutMs: number
) {
  const response = await withinDeadline(context, () =>
    context.fetch(
      new URL(
        '/rest/v1/rpc/expire_inventory_checkout_sessions',
        context.env.SUPABASE_URL
      ),
      {
        method: 'POST',
        headers: databaseHeaders(context.env),
        body: JSON.stringify({
          p_limit: EXPIRY_BATCH_SIZE,
          p_now: now,
          p_ws_id: null,
        }),
        redirect: 'manual',
        signal: requestSignal(context, timeoutMs),
      }
    )
  );
  if (!response.ok) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error(`Checkout expiry RPC failed: ${response.status}`);
  }
  const rows: unknown = await withinDeadline(context, () => response.json());
  if (!Array.isArray(rows) || rows.length > EXPIRY_BATCH_SIZE)
    throw new Error('Checkout expiry RPC shape');
  return rows.map((row: unknown) => {
    if (
      typeof row !== 'object' ||
      row === null ||
      !('ws_id' in row) ||
      typeof row.ws_id !== 'string'
    )
      throw new Error('Checkout expiry RPC shape');
    return row.ws_id;
  });
}

function confirmedWorkspaces(body: unknown, requested: string[]): string[] {
  if (
    typeof body !== 'object' ||
    body === null ||
    !('results' in body) ||
    !Array.isArray(body.results)
  )
    return [];
  const requestedSet = new Set(requested);
  const confirmed = new Set<string>();
  const rejected = new Set<string>();
  for (const result of body.results) {
    if (
      typeof result !== 'object' ||
      result === null ||
      !('wsId' in result) ||
      typeof result.wsId !== 'string' ||
      !requestedSet.has(result.wsId)
    )
      continue;
    if ('ok' in result && result.ok === true) confirmed.add(result.wsId);
    else rejected.add(result.wsId);
  }
  return [...confirmed].filter((id) => !rejected.has(id));
}

async function revalidate(
  context: ProcessorContext,
  workspaces: Set<string>,
  quarantined: Set<string>,
  progress: { revalidated: number }
) {
  const items = [...workspaces];
  for (let index = 0; index < items.length; index += REVALIDATION_CHUNK) {
    if (!(await withinDeadline(context, context.fence))) break;
    const timeoutMs = requestTimeout(context, REVALIDATION_TIMEOUT_MS);
    if (timeoutMs === null) break;
    const chunk = items.slice(index, index + REVALIDATION_CHUNK);
    let confirmed: string[] = [];
    try {
      const response = await withinDeadline(context, () =>
        context.fetch(
          new URL(
            '/api/cron/inventory/checkout-expiry',
            context.env.INVENTORY_ORIGIN
          ),
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${context.env.CRON_SECRET_INVENTORY}`,
              'Content-Type': 'application/json',
              'User-Agent': context.userAgent,
            },
            body: JSON.stringify({ revalidateWorkspaceIds: chunk }),
            redirect: 'manual',
            signal: requestSignal(context, timeoutMs),
          }
        )
      );
      if (!response.ok) {
        void response.body?.cancel().catch(() => undefined);
        throw new Error(`Storefront revalidation failed: ${response.status}`);
      }
      const body: unknown = await withinDeadline(context, () =>
        response.json()
      );
      confirmed = confirmedWorkspaces(body, chunk);
    } catch (error) {
      console.error('Checkout expiry revalidation chunk failed', { error });
    }
    if (confirmed.length > 0) {
      await withinDeadline(context, () => context.pending.settle(confirmed));
      for (const id of confirmed) workspaces.delete(id);
      progress.revalidated += confirmed.length;
    }
    const succeeded = new Set(confirmed);
    const failed = chunk.filter((id) => !succeeded.has(id));
    if (failed.length > 0) {
      const moved = await withinDeadline(context, () =>
        context.pending.fail(failed)
      );
      for (const id of moved) {
        workspaces.delete(id);
        quarantined.add(id);
      }
    }
  }
}

export async function expireCheckouts(
  input: ProcessorContext
): Promise<ProcessorResult> {
  const hardStop = AbortSignal.timeout(
    Math.max(0, input.deadline - input.now())
  );
  const context = {
    ...input,
    signal: input.signal ? AbortSignal.any([input.signal, hardStop]) : hardStop,
  };
  const outstanding = new Set<string>();
  const quarantined = new Set<string>();
  let batches = 0;
  let expired = 0;
  const progress = { revalidated: 0 };
  let outcome: ProcessorResult['outcome'] = 'ok';
  try {
    for (const id of await withinDeadline(context, context.pending.list))
      outstanding.add(id);
    for (const id of await withinDeadline(context, context.pending.quarantined))
      quarantined.add(id);
    // Reserve the first two minutes for owed work. A backlog left after that
    // phase prevents new expiry work from consuming the rest of the run.
    if (outstanding.size > 0)
      await revalidate(
        {
          ...context,
          deadline: Math.min(
            context.deadline,
            context.now() + REVALIDATION_RESERVE_MS
          ),
        },
        outstanding,
        quarantined,
        progress
      );
    if (outstanding.size > 0) outcome = 'failed';
    else {
      const now = new Date(context.now()).toISOString();
      while (batches < EXPIRY_MAX_BATCHES) {
        if (!(await withinDeadline(context, context.fence))) {
          outcome = 'stopped';
          break;
        }
        // Worst-case distinct workspaces per batch are reserved before expiry.
        // Dead letters share the same storage bound and are never evicted.
        if (
          outstanding.size + quarantined.size + EXPIRY_BATCH_SIZE >
          MAX_PENDING_WORK
        ) {
          outcome = 'failed';
          break;
        }
        const timeoutMs = requestTimeout(context, DATABASE_TIMEOUT_MS);
        if (timeoutMs === null) {
          outcome = 'unknown';
          break;
        }
        const batch = await expireBatch(context, now, timeoutMs);
        batches++;
        expired += batch.length;
        const fresh = [...new Set(batch)].filter(
          (id) => !outstanding.has(id) && !quarantined.has(id)
        );
        if (fresh.length > 0) {
          await withinDeadline(context, () => context.pending.add(fresh));
          for (const id of fresh) outstanding.add(id);
        }
        if (batch.length < EXPIRY_BATCH_SIZE) break;
      }
    }
  } catch (error) {
    console.error('Checkout expiry sweep failed', { error });
    outcome = outcomeOf(error);
  }
  // Failed owed items are never retried again during the same sweep.
  if (batches > 0 && outstanding.size > 0) {
    try {
      await revalidate(context, outstanding, quarantined, progress);
    } catch (error) {
      outcome = outcomeOf(error);
    }
  }
  if (outcome === 'ok' && (outstanding.size > 0 || quarantined.size > 0))
    outcome = 'failed';
  return {
    detail: {
      batches,
      expired,
      pending: outstanding.size,
      quarantined: quarantined.size,
      revalidated: progress.revalidated,
    },
    outcome,
  };
}
