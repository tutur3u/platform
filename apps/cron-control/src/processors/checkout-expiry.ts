import { databaseHeaders } from '../database';
import type { ProcessorContext, ProcessorResult } from './types';

// Worker port of Inventory's checkout-expiry processor. The expiry RPC claims
// rows with FOR UPDATE SKIP LOCKED and only moves reserved rows to expired, so
// a concurrent legacy run cannot double-expire. Bounds match the Next route.
export const EXPIRY_BATCH_SIZE = 1_000;
export const EXPIRY_MAX_BATCHES = 10;
export const REVALIDATION_CHUNK = 100;
const DATABASE_TIMEOUT_MS = 30_000;
const REVALIDATION_TIMEOUT_MS = 60_000;
// No request starts with less than this left before the run's deadline.
export const MIN_REQUEST_MS = 1_000;

// Each request gets its fixed timeout capped by the time left before the
// deadline, so the requests of one run can never outlast its lease. Null
// means the run must stop and leave the rest to the next sweep.
function requestTimeout(context: ProcessorContext, cap: number) {
  const remaining = context.deadline - context.now();
  return remaining < MIN_REQUEST_MS ? null : Math.min(cap, remaining);
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
  const { env } = context;
  const response = await context.fetch(
    new URL(
      '/rest/v1/rpc/expire_inventory_checkout_sessions',
      env.SUPABASE_URL
    ),
    {
      method: 'POST',
      headers: databaseHeaders(env),
      body: JSON.stringify({
        p_limit: EXPIRY_BATCH_SIZE,
        p_now: now,
        p_ws_id: null,
      }),
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    }
  );
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`Checkout expiry RPC failed: ${response.status}`);
  }
  const rows = (await response.json()) as unknown;
  if (!Array.isArray(rows)) throw new Error('Checkout expiry RPC shape');
  return rows.map((row: { ws_id?: unknown }) => {
    if (typeof row?.ws_id !== 'string')
      throw new Error('Checkout expiry RPC shape');
    return row.ws_id;
  });
}

// Storefront caches live in the Next.js host, so the affected workspaces are
// posted to Inventory's authenticated checkout-expiry route for revalidation.
// Each accepted chunk settles its durable obligation; returns how many were
// revalidated before the deadline (the rest stay pending).
async function revalidate(context: ProcessorContext, workspaces: string[]) {
  const { env } = context;
  let revalidated = 0;
  for (let index = 0; index < workspaces.length; index += REVALIDATION_CHUNK) {
    const timeoutMs = requestTimeout(context, REVALIDATION_TIMEOUT_MS);
    if (timeoutMs === null) break;
    const chunk = workspaces.slice(index, index + REVALIDATION_CHUNK);
    const response = await context.fetch(
      new URL('/api/cron/inventory/checkout-expiry', env.INVENTORY_ORIGIN),
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.CRON_SECRET_INVENTORY}`,
          'Content-Type': 'application/json',
          'User-Agent': context.userAgent,
        },
        body: JSON.stringify({ revalidateWorkspaceIds: chunk }),
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      }
    );
    await response.body?.cancel().catch(() => undefined);
    if (!response.ok)
      throw new Error(`Storefront revalidation failed: ${response.status}`);
    await context.pending.settle(chunk);
    revalidated += chunk.length;
  }
  return revalidated;
}

export async function expireCheckouts(
  context: ProcessorContext
): Promise<ProcessorResult> {
  const now = new Date(context.now()).toISOString();
  // Revalidation owed by earlier sweeps (for example after a 503) is retried
  // here before and independently of new expiries.
  const outstanding = new Set(await context.pending.list());
  let batches = 0;
  let expired = 0;
  let outcome: ProcessorResult['outcome'] = 'ok';
  try {
    while (batches < EXPIRY_MAX_BATCHES) {
      if (batches > 0 && !(await context.fence())) {
        outcome = 'stopped';
        break;
      }
      const timeoutMs = requestTimeout(context, DATABASE_TIMEOUT_MS);
      if (timeoutMs === null) break;
      const batch = await expireBatch(context, now, timeoutMs);
      batches++;
      expired += batch.length;
      const fresh = [...new Set(batch)].filter((id) => !outstanding.has(id));
      // Persist the obligation before revalidating, so a failed or
      // terminated revalidation is retried by a later sweep.
      if (fresh.length > 0) {
        await context.pending.add(fresh);
        for (const wsId of fresh) outstanding.add(wsId);
      }
      if (batch.length < EXPIRY_BATCH_SIZE) break;
    }
  } catch (error) {
    console.error('Checkout expiry batch failed', { error });
    outcome = outcomeOf(error);
  }
  // Committed expiries are revalidated even when a later batch failed.
  let revalidated = 0;
  if (outstanding.size > 0) {
    try {
      revalidated = await revalidate(context, [...outstanding]);
    } catch (error) {
      console.error('Checkout expiry revalidation failed', { error });
      if (outcome === 'ok') outcome = outcomeOf(error);
    }
  }
  return {
    detail: {
      batches,
      expired,
      pending: outstanding.size - revalidated,
      revalidated,
    },
    outcome,
  };
}
