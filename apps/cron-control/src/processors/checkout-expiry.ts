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

function outcomeOf(error: unknown): ProcessorResult['outcome'] {
  const name = error instanceof Error ? error.name : '';
  return name === 'TimeoutError' || name === 'AbortError'
    ? 'unknown'
    : 'failed';
}

async function expireBatch(context: ProcessorContext, now: string) {
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
      signal: AbortSignal.timeout(DATABASE_TIMEOUT_MS),
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
async function revalidate(context: ProcessorContext, workspaces: string[]) {
  const { env } = context;
  for (let index = 0; index < workspaces.length; index += REVALIDATION_CHUNK) {
    const response = await context.fetch(
      new URL('/api/cron/inventory/checkout-expiry', env.INVENTORY_ORIGIN),
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.CRON_SECRET_INVENTORY}`,
          'Content-Type': 'application/json',
          'User-Agent': context.userAgent,
        },
        body: JSON.stringify({
          revalidateWorkspaceIds: workspaces.slice(
            index,
            index + REVALIDATION_CHUNK
          ),
        }),
        redirect: 'manual',
        signal: AbortSignal.timeout(REVALIDATION_TIMEOUT_MS),
      }
    );
    await response.body?.cancel().catch(() => undefined);
    if (!response.ok)
      throw new Error(`Storefront revalidation failed: ${response.status}`);
  }
}

export async function expireCheckouts(
  context: ProcessorContext
): Promise<ProcessorResult> {
  const now = new Date(context.now()).toISOString();
  const workspaces = new Set<string>();
  let batches = 0;
  let expired = 0;
  let outcome: ProcessorResult['outcome'] = 'ok';
  try {
    while (batches < EXPIRY_MAX_BATCHES) {
      if (batches > 0 && !(await context.fence())) {
        outcome = 'stopped';
        break;
      }
      const batch = await expireBatch(context, now);
      batches++;
      expired += batch.length;
      for (const wsId of batch) workspaces.add(wsId);
      if (batch.length < EXPIRY_BATCH_SIZE) break;
    }
  } catch (error) {
    console.error('Checkout expiry batch failed', { error });
    outcome = outcomeOf(error);
  }
  // Committed expiries are revalidated even when a later batch failed.
  let revalidated = 0;
  if (workspaces.size > 0) {
    try {
      await revalidate(context, [...workspaces]);
      revalidated = workspaces.size;
    } catch (error) {
      console.error('Checkout expiry revalidation failed', { error });
      if (outcome === 'ok') outcome = outcomeOf(error);
    }
  }
  return { detail: { batches, expired, revalidated }, outcome };
}
