import { databaseHeaders } from '../database';
import { withinDeadline } from './deadline';
import type { ProcessorContext, ProcessorResult } from './types';

export const HISTORY_BATCH_SIZE = 1_000;

export async function pruneCronHistory(
  context: ProcessorContext
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
    context.fetch(
      new URL('/rest/v1/rpc/prune_cron_history', context.env.SUPABASE_URL),
      {
        method: 'POST',
        headers: databaseHeaders(context.env),
        body: JSON.stringify({ p_limit: HISTORY_BATCH_SIZE }),
        redirect: 'manual',
        signal,
      }
    )
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
    if (
      typeof result !== 'object' ||
      result === null ||
      !('pg_cron_deleted' in result) ||
      !('managed_deleted' in result) ||
      typeof result.pg_cron_deleted !== 'number' ||
      typeof result.managed_deleted !== 'number' ||
      !Number.isInteger(result.pg_cron_deleted) ||
      !Number.isInteger(result.managed_deleted) ||
      result.pg_cron_deleted < 0 ||
      result.pg_cron_deleted > HISTORY_BATCH_SIZE ||
      result.managed_deleted < 0 ||
      result.managed_deleted > HISTORY_BATCH_SIZE
    )
      return { detail: {}, outcome: 'unknown' };
    return {
      detail: {
        pg_cron_deleted: result.pg_cron_deleted,
        managed_deleted: result.managed_deleted,
      },
      outcome: 'ok',
    };
  } catch {
    return { detail: {}, outcome: 'unknown' };
  } finally {
    void reader.cancel().catch(() => undefined);
  }
}
