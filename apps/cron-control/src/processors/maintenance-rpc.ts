import { databaseHeaders } from '../database';
import { withinDeadline } from './deadline';
import type { ProcessorContext, ProcessorResult } from './types';

export const MAINTENANCE_BATCH_SIZE = 1_000;

/**
 * Calls one bounded private maintenance RPC (`p_limit` rows) once per slot.
 * The response must be a small JSON object whose `counters` are integers in
 * [0, MAINTENANCE_BATCH_SIZE]; anything else is an unknown outcome. There is
 * no in-slot retry: an ambiguous delete is never replayed immediately.
 */
export async function callMaintenanceRpc(
  context: ProcessorContext,
  rpc: string,
  counters: readonly string[]
): Promise<ProcessorResult> {
  if (!(await withinDeadline(context, context.fence)))
    return { detail: {}, outcome: 'stopped' };
  const timeout = AbortSignal.timeout(
    Math.max(1, Math.min(30_000, context.deadline - context.now()))
  );
  const signal = context.signal
    ? AbortSignal.any([context.signal, timeout])
    : timeout;
  const response = await withinDeadline(context, () =>
    context.fetch(new URL(`/rest/v1/rpc/${rpc}`, context.env.SUPABASE_URL), {
      method: 'POST',
      headers: databaseHeaders(context.env),
      body: JSON.stringify({ p_limit: MAINTENANCE_BATCH_SIZE }),
      redirect: 'manual',
      signal,
    })
  );
  if (!response.ok) {
    void response.body?.cancel().catch(() => undefined);
    return { detail: {}, outcome: 'failed' };
  }
  // One scalar summary is expected; cap bytes before parsing any response.
  const reader = response.body?.getReader();
  if (!reader) return { detail: {}, outcome: 'unknown' };
  let body = '';
  let bytes = 0;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    while (true) {
      const { done, value } = await withinDeadline(context, () =>
        reader.read()
      );
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 1_024) return { detail: {}, outcome: 'unknown' };
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    const result: unknown = JSON.parse(body);
    if (typeof result !== 'object' || result === null)
      return { detail: {}, outcome: 'unknown' };
    const detail: Record<string, number> = {};
    for (const key of counters) {
      const value = (result as Record<string, unknown>)[key];
      if (
        typeof value !== 'number' ||
        !Number.isInteger(value) ||
        value < 0 ||
        value > MAINTENANCE_BATCH_SIZE
      )
        return { detail: {}, outcome: 'unknown' };
      detail[key] = value;
    }
    return { detail, outcome: 'ok' };
  } catch {
    return { detail: {}, outcome: 'unknown' };
  } finally {
    void reader.cancel().catch(() => undefined);
  }
}
