import { databaseHeaders } from '../database';
import { withinDeadline } from './deadline';
import type { ProcessorContext, ProcessorResult } from './types';

export const MAINTENANCE_BATCH_SIZE = 1_000;
const MAX_RPC_RESPONSE_BYTES = 1_024;

export type PrivateRpcResult =
  | { kind: 'ok'; value: unknown }
  | { kind: 'http'; status: number; code?: string }
  | { kind: 'invalid' };

/**
 * POSTs one private RPC with the service key under the run deadline. Network
 * errors and the deadline throw. A response must be at most `maxBytes` (1 KiB
 * by default) of JSON; anything unreadable is `invalid`, so its outcome is
 * unknown. With `readErrorCode`, an error response's body is read under the
 * same cap and its PostgREST `code` is returned; otherwise it is discarded.
 */
export async function postPrivateRpc(
  context: Pick<
    ProcessorContext,
    'deadline' | 'env' | 'fetch' | 'now' | 'signal'
  >,
  rpc: string,
  body: Record<string, unknown>,
  maxBytes = MAX_RPC_RESPONSE_BYTES,
  { readErrorCode = false }: { readErrorCode?: boolean } = {}
): Promise<PrivateRpcResult> {
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
      body: JSON.stringify(body),
      redirect: 'manual',
      signal,
    })
  );
  return readRpcResponse(context, response, maxBytes, readErrorCode);
}

export async function readRpcResponse(
  context: Pick<ProcessorContext, 'deadline' | 'now' | 'signal'>,
  response: Response,
  maxBytes: number,
  readErrorCode = false
): Promise<PrivateRpcResult> {
  if (!response.ok) {
    if (!readErrorCode) {
      void response.body?.cancel().catch(() => undefined);
      return { kind: 'http', status: response.status };
    }
    const error = await readBoundedJson(context, response, maxBytes);
    const code =
      error.kind === 'ok' &&
      typeof error.value === 'object' &&
      error.value !== null
        ? (error.value as { code?: unknown }).code
        : undefined;
    return typeof code === 'string'
      ? { code, kind: 'http', status: response.status }
      : { kind: 'http', status: response.status };
  }
  return readBoundedJson(context, response, maxBytes);
}

async function readBoundedJson(
  context: Pick<ProcessorContext, 'deadline' | 'now' | 'signal'>,
  response: Response,
  maxBytes: number
): Promise<{ kind: 'ok'; value: unknown } | { kind: 'invalid' }> {
  // One scalar summary is expected; cap bytes before parsing any response.
  const reader = response.body?.getReader();
  if (!reader) return { kind: 'invalid' };
  let text = '';
  let bytes = 0;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    while (true) {
      const { done, value } = await withinDeadline(context, () =>
        reader.read()
      );
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) return { kind: 'invalid' };
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { kind: 'ok', value: JSON.parse(text) };
  } catch {
    return { kind: 'invalid' };
  } finally {
    void reader.cancel().catch(() => undefined);
  }
}

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
  const result = await postPrivateRpc(context, rpc, {
    p_limit: MAINTENANCE_BATCH_SIZE,
  });
  if (result.kind === 'http') return { detail: {}, outcome: 'failed' };
  if (
    result.kind === 'invalid' ||
    typeof result.value !== 'object' ||
    result.value === null
  )
    return { detail: {}, outcome: 'unknown' };
  const detail: Record<string, number> = {};
  for (const key of counters) {
    const value = (result.value as Record<string, unknown>)[key];
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
}
